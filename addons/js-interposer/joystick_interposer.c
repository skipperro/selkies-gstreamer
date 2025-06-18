/*
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
*/

/*
    Selkies Joystick Interposer

    An LD_PRELOAD library to redirect /dev/input/jsX and /dev/input/event*
    device access to corresponding Unix domain sockets. This allows joystick
    input to be piped from another source (e.g., a remote session).
*/

#define _GNU_SOURCE         // Required for RTLD_NEXT
#define _LARGEFILE64_SOURCE 1 // For open64 support
#include <dlfcn.h>
#include <stdio.h>
#include <stdarg.h>
#include <fcntl.h>
#include <string.h>
#include <stdint.h>
#include <stdlib.h> // For getenv
#include <sys/socket.h>
#include <arpa/inet.h>
#include <sys/un.h>
#include <sys/ioctl.h>
#include <linux/ioctl.h>
#include <sys/epoll.h>
#include <unistd.h>
#include <errno.h>
#include <time.h>
#include <linux/joystick.h>
#include <linux/input.h>
#include <linux/input-event-codes.h>

// Defines ioctl_request_t type based on GLIBC presence for portability.
#ifdef __GLIBC__
typedef unsigned long ioctl_request_t;
#else
typedef int ioctl_request_t;
#endif

// Timeout for socket connection attempts in milliseconds.
#define SOCKET_CONNECT_TIMEOUT_MS 250

// Device paths and corresponding socket paths for joystick interposition.
#define JS0_DEVICE_PATH "/dev/input/js0"
#define JS0_SOCKET_PATH "/tmp/selkies_js0.sock"
#define JS1_DEVICE_PATH "/dev/input/js1"
#define JS1_SOCKET_PATH "/tmp/selkies_js1.sock"
#define JS2_DEVICE_PATH "/dev/input/js2"
#define JS2_SOCKET_PATH "/tmp/selkies_js2.sock"
#define JS3_DEVICE_PATH "/dev/input/js3"
#define JS3_SOCKET_PATH "/tmp/selkies_js3.sock"
#define NUM_JS_INTERPOSERS 4 // Number of /dev/input/jsX devices to interpose.

// Device paths and corresponding socket paths for event device interposition.
// Using high event numbers (e.g., event1000) to avoid conflict with real devices.
#define EV0_DEVICE_PATH "/dev/input/event1000"
#define EV0_SOCKET_PATH "/tmp/selkies_event1000.sock"
#define EV1_DEVICE_PATH "/dev/input/event1001"
#define EV1_SOCKET_PATH "/tmp/selkies_event1001.sock"
#define EV2_DEVICE_PATH "/dev/input/event1002"
#define EV2_SOCKET_PATH "/tmp/selkies_event1002.sock"
#define EV3_DEVICE_PATH "/dev/input/event1003"
#define EV3_SOCKET_PATH "/tmp/selkies_event1003.sock"
#define NUM_EV_INTERPOSERS 4 // Number of /dev/input/event* devices to interpose.

// Total number of interposers (js + ev).
#define NUM_INTERPOSERS() (NUM_JS_INTERPOSERS + NUM_EV_INTERPOSERS)

// --- Hardcoded Identity to match fake_udev.c ---
// These values are used to respond to ioctl queries for device identity,
// ensuring consistency with a potential fake udev setup.
#define FAKE_UDEV_DEVICE_NAME "Microsoft X-Box 360 pad"
#define FAKE_UDEV_VENDOR_ID   0x045e
#define FAKE_UDEV_PRODUCT_ID  0x028e
#define FAKE_UDEV_VERSION_ID  0x0114
#define FAKE_UDEV_BUS_TYPE    BUS_USB // Typically 0x03

// --- Logging ---
// Global flag to control logging, initialized by sji_logging_init.
static int g_sji_log_enabled = 0;

// Log level constants.
#define SJI_LOG_LEVEL_DEBUG "[DEBUG]"
#define SJI_LOG_LEVEL_INFO  "[INFO]"
#define SJI_LOG_LEVEL_WARN  "[WARN]"
#define SJI_LOG_LEVEL_ERROR "[ERROR]"

// Initializes the logging system based on the JS_LOG environment variable.
// Must be called once at the very start of the library's initialization.
static void sji_logging_init() {
    if (getenv("JS_LOG") != NULL) {
        g_sji_log_enabled = 1;
    }
}

// Central logging function.
// Logs messages to stdout (INFO, DEBUG) or stderr (WARN, ERROR)
// if g_sji_log_enabled is true.
static void interposer_log(const char *level, const char *func_name, int line_num, const char *format, ...) {
    if (!g_sji_log_enabled) {
        return;
    }

    // Determine output stream based on log level
    FILE *output_stream = stdout;
    if (strcmp(level, SJI_LOG_LEVEL_WARN) == 0 || strcmp(level, SJI_LOG_LEVEL_ERROR) == 0) {
        output_stream = stderr;
    }

    // Print timestamp, SJI prefix, level, function name, and line number
    fprintf(output_stream, "[%lu][SJI]%s[%s:%d] ", (unsigned long)time(NULL), level, func_name, line_num);

    // Print the variadic arguments
    va_list argp;
    va_start(argp, format);
    vfprintf(output_stream, format, argp);
    va_end(argp);

    fprintf(output_stream, "\n");
    fflush(output_stream); // Ensure the log message is written immediately
}

// Logging macros for convenience.
#define sji_log_debug(...) interposer_log(SJI_LOG_LEVEL_DEBUG, __func__, __LINE__, __VA_ARGS__)
#define sji_log_info(...)  interposer_log(SJI_LOG_LEVEL_INFO,  __func__, __LINE__, __VA_ARGS__)
#define sji_log_warn(...)  interposer_log(SJI_LOG_LEVEL_WARN,  __func__, __LINE__, __VA_ARGS__)
#define sji_log_error(...) interposer_log(SJI_LOG_LEVEL_ERROR, __func__, __LINE__, __VA_ARGS__)

// --- Real Function Pointers & Loading ---
// Pointers to the real libc functions that this library intercepts.
static int (*real_open)(const char *pathname, int flags, ...) = NULL;
static int (*real_open64)(const char *pathname, int flags, ...) = NULL;
static int (*real_ioctl)(int fd, ioctl_request_t request, ...) = NULL;
static int (*real_epoll_ctl)(int epfd, int op, int fd, struct epoll_event *event) = NULL;
static int (*real_close)(int fd) = NULL;
static ssize_t (*real_read)(int fd, void *buf, size_t count) = NULL;
static ssize_t (*real_write)(int fd, const void *buf, size_t count) = NULL; // For completeness, used for arch byte.

// Loads a real function pointer using dlsym(RTLD_NEXT, ...).
// Logs an error if dlsym fails.
static int load_real_func(void (**target_func_ptr)(void), const char *name) {
    if (*target_func_ptr != NULL) { // Already loaded
        return 0;
    }
    *target_func_ptr = dlsym(RTLD_NEXT, name);
    if (*target_func_ptr == NULL) {
        // sji_log_error respects g_sji_log_enabled.
        // If JS_LOG is not set, this critical error won't be visible unless debugging.
        sji_log_error("Failed to load real '%s': %s. Interposer functionality may be compromised.", name, dlerror());
        return -1;
    }
    return 0;
}

// --- Data Structures ---
// Structure for joystick correction data (JSIOCSCORR/GCORR).
typedef struct js_corr js_corr_t; // Definition from <linux/joystick.h> is opaque, we just store it.

#define CONTROLLER_NAME_MAX_LEN 255 // Maximum length for controller name string.
#define INTERPOSER_MAX_BTNS 512     // Maximum number of buttons supported in config.
#define INTERPOSER_MAX_AXES 64      // Maximum number of axes supported in config.

// Configuration for a joystick/controller, received from the socket server.
typedef struct {
    char name[CONTROLLER_NAME_MAX_LEN]; // Controller name.
    uint16_t vendor;                    // Vendor ID.
    uint16_t product;                   // Product ID.
    uint16_t version;                   // Version ID.
    uint16_t num_btns;                  // Number of buttons.
    uint16_t num_axes;                  // Number of axes.
    uint16_t btn_map[INTERPOSER_MAX_BTNS]; // Button mapping.
    uint8_t axes_map[INTERPOSER_MAX_AXES]; // Axis mapping.
    // Padding to ensure consistent struct size if needed, e.g., for network transfer.
    // The size of this struct must match the server's definition.
    uint8_t final_alignment_padding[6];
} js_config_t;

// State for each interposed device.
typedef struct {
    uint8_t type;                       // DEV_TYPE_JS or DEV_TYPE_EV.
    char open_dev_name[255];            // Original device path (e.g., "/dev/input/js0").
    char socket_path[255];              // Path to the Unix domain socket.
    int sockfd;                         // Socket file descriptor, -1 if not connected.
    int open_flags;                     // Flags used by the application to open the device.
    js_corr_t corr;                     // Stores correction data for JSIOCSCORR/GCORR.
    js_config_t js_config;              // Device configuration received from the socket.
} js_interposer_t;

// Device type identifiers.
#define DEV_TYPE_JS 0 // Joystick device (/dev/input/jsX)
#define DEV_TYPE_EV 1 // Event device (/dev/input/event*)

// Default values for EVIOCGABS ioctl responses.
#define ABS_AXIS_MIN_DEFAULT -32767
#define ABS_AXIS_MAX_DEFAULT 32767
#define ABS_TRIGGER_MIN_DEFAULT 0
#define ABS_TRIGGER_MAX_DEFAULT 255
#define ABS_HAT_MIN_DEFAULT -1
#define ABS_HAT_MAX_DEFAULT 1

// Array holding state for all configured interposers.
static js_interposer_t interposers[NUM_INTERPOSERS()] = {
    // Joystick devices
    { DEV_TYPE_JS, JS0_DEVICE_PATH, JS0_SOCKET_PATH, -1, 0, {0}, {0} },
    { DEV_TYPE_JS, JS1_DEVICE_PATH, JS1_SOCKET_PATH, -1, 0, {0}, {0} },
    { DEV_TYPE_JS, JS2_DEVICE_PATH, JS2_SOCKET_PATH, -1, 0, {0}, {0} },
    { DEV_TYPE_JS, JS3_DEVICE_PATH, JS3_SOCKET_PATH, -1, 0, {0}, {0} },
    // Event devices
    { DEV_TYPE_EV, EV0_DEVICE_PATH, EV0_SOCKET_PATH, -1, 0, {0}, {0} },
    { DEV_TYPE_EV, EV1_DEVICE_PATH, EV1_SOCKET_PATH, -1, 0, {0}, {0} },
    { DEV_TYPE_EV, EV2_DEVICE_PATH, EV2_SOCKET_PATH, -1, 0, {0}, {0} },
    { DEV_TYPE_EV, EV3_DEVICE_PATH, EV3_SOCKET_PATH, -1, 0, {0}, {0} },
};

// Constructor function, called when the library is loaded.
// Initializes logging and loads pointers to real libc functions.
__attribute__((constructor)) void init_interposer() {
    sji_logging_init(); // Initialize logging based on JS_LOG env var FIRST.

    // Load real function pointers. Errors are logged by load_real_func.
    if (load_real_func((void *)&real_open, "open") < 0) sji_log_error("CRITICAL: Failed to load real 'open'.");
    if (load_real_func((void *)&real_ioctl, "ioctl") < 0) sji_log_error("CRITICAL: Failed to load real 'ioctl'.");
    if (load_real_func((void *)&real_epoll_ctl, "epoll_ctl") < 0) sji_log_error("CRITICAL: Failed to load real 'epoll_ctl'.");
    if (load_real_func((void *)&real_close, "close") < 0) sji_log_error("CRITICAL: Failed to load real 'close'.");
    if (load_real_func((void *)&real_read, "read") < 0) sji_log_error("CRITICAL: Failed to load real 'read'.");
    if (load_real_func((void *)&real_write, "write") < 0) sji_log_error("CRITICAL: Failed to load real 'write'.");
    load_real_func((void *)&real_open64, "open64"); // Optional, might not exist on all systems.
    sji_log_info("Selkies Joystick Interposer initialized. Logging is %s.", g_sji_log_enabled ? "ENABLED" : "DISABLED");
}

// Sets a socket file descriptor to non-blocking mode.
// Returns 0 on success, -1 on failure.
static int make_socket_nonblocking(int sockfd) {
    int flags = fcntl(sockfd, F_GETFL, 0);
    if (flags == -1) {
        sji_log_error("make_socket_nonblocking: fcntl(F_GETFL) failed for fd %d: %s", sockfd, strerror(errno));
        return -1;
    }
    if (!(flags & O_NONBLOCK)) {
        if (fcntl(sockfd, F_SETFL, flags | O_NONBLOCK) == -1) {
            sji_log_error("make_socket_nonblocking: fcntl(F_SETFL, O_NONBLOCK) failed for fd %d: %s", sockfd, strerror(errno));
            return -1;
        }
        sji_log_info("Socket fd %d successfully set to O_NONBLOCK.", sockfd);
    } else {
        sji_log_debug("Socket fd %d was already O_NONBLOCK.", sockfd);
    }
    return 0;
}

// Reads the js_config_t structure from the connected socket.
// Temporarily makes the socket blocking for this read if it was non-blocking.
// Returns 0 on success, -1 on failure.
static int read_socket_config(int sockfd, js_config_t *config_dest) {
    ssize_t bytes_to_read = sizeof(js_config_t);
    ssize_t bytes_read_total = 0;
    char *buffer_ptr = (char *)config_dest;
    int original_socket_flags = fcntl(sockfd, F_GETFL, 0);
    int socket_was_nonblocking = 0;

    if (original_socket_flags == -1) {
        sji_log_warn("read_socket_config: fcntl(F_GETFL) failed for sockfd %d: %s. Cannot ensure blocking for config read.", sockfd, strerror(errno));
    } else if (original_socket_flags & O_NONBLOCK) {
        socket_was_nonblocking = 1;
        sji_log_debug("read_socket_config: sockfd %d is O_NONBLOCK. Temporarily setting to blocking for config read.", sockfd);
        if (fcntl(sockfd, F_SETFL, original_socket_flags & ~O_NONBLOCK) == -1) {
            sji_log_warn("read_socket_config: Failed to make sockfd %d blocking for config read: %s. Proceeding with potentially non-blocking read.", sockfd, strerror(errno));
            // If setting to blocking fails, the read might behave differently (e.g. EAGAIN)
        }
    }

    sji_log_info("Attempting to read joystick config (%zd bytes) from sockfd %d.", bytes_to_read, sockfd);
    while (bytes_read_total < bytes_to_read) {
        // Use real_read as we are reading from a socket, not an application-opened device.
        ssize_t current_read = real_read(sockfd, buffer_ptr + bytes_read_total, bytes_to_read - bytes_read_total);
        if (current_read == -1) {
            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                // This might happen if fcntl to remove O_NONBLOCK failed, or if server is slow.
                sji_log_warn("read_socket_config: real_read on sockfd %d returned EAGAIN/EWOULDBLOCK. Retrying after short delay.", sockfd);
                usleep(100000); // Sleep 100ms and retry for config read
                continue;
            }
            sji_log_error("read_socket_config: real_read failed on sockfd %d: %s", sockfd, strerror(errno));
            goto config_read_cleanup;
        } else if (current_read == 0) {
            sji_log_error("read_socket_config: EOF on sockfd %d after %zd bytes (expected %zd). Peer closed connection?", sockfd, bytes_read_total, bytes_to_read);
            goto config_read_cleanup;
        }
        bytes_read_total += current_read;
    }

    sji_log_info("Successfully read joystick config from sockfd %d: Name='%s', Vnd=0x%04x, Prd=0x%04x, Ver=0x%04x, Btns=%u, Axes=%u",
                 sockfd, config_dest->name, config_dest->vendor, config_dest->product, config_dest->version,
                 config_dest->num_btns, config_dest->num_axes);

    // Ensure the received name is null-terminated.
    if (strnlen(config_dest->name, CONTROLLER_NAME_MAX_LEN) == CONTROLLER_NAME_MAX_LEN) {
        config_dest->name[CONTROLLER_NAME_MAX_LEN-1] = '\0';
        sji_log_warn("Config name from server was not null-terminated within max length; forced termination.");
    }

config_read_cleanup:
    if (socket_was_nonblocking && original_socket_flags != -1) {
        sji_log_debug("read_socket_config: Restoring O_NONBLOCK to sockfd %d.", sockfd);
        if (fcntl(sockfd, F_SETFL, original_socket_flags) == -1) {
            sji_log_warn("read_socket_config: Failed to restore O_NONBLOCK to sockfd %d: %s", sockfd, strerror(errno));
        }
    }
    return (bytes_read_total == bytes_to_read) ? 0 : -1;
}

// Connects the interposer to its corresponding Unix domain socket.
// Reads configuration and sends architecture byte upon successful connection.
// Returns 0 on success, -1 on failure.
static int connect_interposer_socket(js_interposer_t *interposer) {
    interposer->sockfd = socket(AF_UNIX, SOCK_STREAM, 0);
    if (interposer->sockfd == -1) {
        sji_log_error("Failed to create socket for %s: %s", interposer->socket_path, strerror(errno));
        return -1;
    }

    struct sockaddr_un addr;
    memset(&addr, 0, sizeof(struct sockaddr_un));
    addr.sun_family = AF_UNIX;
    strncpy(addr.sun_path, interposer->socket_path, sizeof(addr.sun_path) - 1);

    int attempt = 0;
    long total_slept_us = 0;
    long timeout_us = SOCKET_CONNECT_TIMEOUT_MS * 1000;
    long sleep_interval_us = 10000; // 10ms

    sji_log_info("Attempting to connect to %s (fd %d)...", interposer->socket_path, interposer->sockfd);
    while (connect(interposer->sockfd, (struct sockaddr *)&addr, sizeof(struct sockaddr_un)) == -1) {
        if (errno == ENOENT || errno == ECONNREFUSED) {
            if (total_slept_us >= timeout_us) {
                sji_log_error("Timed out connecting to socket %s after %dms.", interposer->socket_path, SOCKET_CONNECT_TIMEOUT_MS);
                goto connect_fail;
            }
            // Log first attempt and then periodically.
            if (attempt == 0 || (attempt % 10 == 0)) { // Log first attempt and every 10th (100ms)
                 sji_log_warn("Connection to %s refused/not found, retrying (attempt %d, elapsed %ldms)...",
                              interposer->socket_path, attempt + 1, total_slept_us / 1000);
            }
            usleep(sleep_interval_us);
            total_slept_us += sleep_interval_us;
            attempt++;
            continue;
        }
        sji_log_error("Failed to connect to socket %s: %s", interposer->socket_path, strerror(errno));
        goto connect_fail;
    }
    sji_log_info("Connected to socket %s (fd %d).", interposer->socket_path, interposer->sockfd);

    // Read device configuration from the socket.
    if (read_socket_config(interposer->sockfd, &(interposer->js_config)) != 0) {
        sji_log_error("Failed to read config from socket %s.", interposer->socket_path);
        goto connect_fail;
    }

    // Send architecture specifier (size of long) to the server.
    // This helps the server adapt if it needs to handle data from different architectures.
    unsigned char arch_byte[1] = { (unsigned char)sizeof(long) };
    sji_log_info("Sending architecture specifier (%u bytes, value: %u) to %s.", (unsigned int)sizeof(arch_byte), arch_byte[0], interposer->socket_path);
    if (real_write(interposer->sockfd, arch_byte, sizeof(arch_byte)) != sizeof(arch_byte)) {
        sji_log_error("Failed to send architecture specifier to %s: %s", interposer->socket_path, strerror(errno));
        goto connect_fail;
    }
    return 0;

connect_fail:
    if (interposer->sockfd != -1) {
        real_close(interposer->sockfd); // Use real_close for the socket fd.
        interposer->sockfd = -1;
    }
    return -1;
}

// Common logic for handling open() and open64() calls.
// Checks if the pathname matches an interposable device. If so, connects the socket.
// Returns:
//   - socket fd if successfully interposed.
//   - -1 on error during interposition (errno is set).
//   - -2 if pathname is not recognized for interposition (caller should use real_open).
static int common_open_logic(const char *pathname, int flags, js_interposer_t **found_interposer_ptr) {
    *found_interposer_ptr = NULL;
    for (size_t i = 0; i < NUM_INTERPOSERS(); i++) {
        if (strcmp(pathname, interposers[i].open_dev_name) == 0) {
            *found_interposer_ptr = &interposers[i]; // Found a matching interposer config.

            if (interposers[i].sockfd != -1) {
                // Device is already "open" via our interposer.
                sji_log_info("Device %s already open via interposer (socket_fd %d, app_flags_orig=0x%x, new_req_flags=0x%x). Reusing.",
                             pathname, interposers[i].sockfd, interposers[i].open_flags, flags);
                // Note: The application might try to open with different flags (e.g., O_NONBLOCK).
                // The existing socket's blocking mode (potentially set by epoll_ctl) will prevail.
                // We could adjust based on new flags, but that adds complexity.
                // For now, if already open, its state is managed.
                return interposers[i].sockfd; // Return existing socket fd as the "application fd".
            }

            // This is a new open for this interposed device.
            interposers[i].open_flags = flags; // Store flags application used.

            if (connect_interposer_socket(&interposers[i]) == -1) {
                sji_log_error("Failed to establish socket connection for %s.", pathname);
                interposers[i].open_flags = 0; // Reset flags on failure.
                errno = EIO; // Indicate I/O error for the application.
                return -1;
            }

            // If application requested O_NONBLOCK, try to set the socket to non-blocking.
            if (interposers[i].open_flags & O_NONBLOCK) {
                sji_log_info("Application opened %s with O_NONBLOCK. Setting socket fd %d to non-blocking.",
                             pathname, interposers[i].sockfd);
                if (make_socket_nonblocking(interposers[i].sockfd) == -1) {
                    // Not fatal, but log it. Read/write logic might need to handle this.
                    sji_log_warn("Failed to make socket fd %d non-blocking for %s as requested by app. Socket may remain blocking.",
                                  interposers[i].sockfd, pathname);
                }
            }
            sji_log_info("Successfully interposed 'open' for %s (app_flags=0x%x), socket_fd: %d. Socket flags: 0x%x",
                         pathname, interposers[i].open_flags, interposers[i].sockfd, fcntl(interposers[i].sockfd, F_GETFL, 0));
            return interposers[i].sockfd; // Return the socket fd as the "application fd".
        }
    }
    return -2; // Pathname not recognized for interposition.
}

// Intercepted open() call.
int open(const char *pathname, int flags, ...) {
    if (!real_open) {
        sji_log_error("CRITICAL: real_open not loaded. Cannot proceed with open call.");
        errno = EFAULT; // Or ENOSYS
        return -1;
    }

    js_interposer_t *interposer = NULL;
    int result_fd = common_open_logic(pathname, flags, &interposer);

    if (result_fd == -2) { // Pathname not recognized, pass to real_open.
        mode_t mode = 0;
        if (flags & O_CREAT) {
            va_list args;
            va_start(args, flags);
            mode = va_arg(args, mode_t);
            va_end(args);
            result_fd = real_open(pathname, flags, mode);
        } else {
            result_fd = real_open(pathname, flags);
        }
    }
    // If result_fd is -1, common_open_logic or real_open already set errno.
    // If result_fd >= 0, it's either a real fd or our socket fd.
    return result_fd;
}

#ifdef open64
#undef open64 // Ensure we use our definition if open64 is a macro.
#endif
// Intercepted open64() call.
int open64(const char *pathname, int flags, ...) {
    if (!real_open64 && !real_open) {
        sji_log_error("CRITICAL: Neither real_open64 nor real_open loaded. Cannot proceed with open64 call.");
        errno = EFAULT;
        return -1;
    }

    js_interposer_t *interposer = NULL;
    int result_fd = common_open_logic(pathname, flags, &interposer);

    if (result_fd == -2) { // Pathname not recognized, pass to real_open64 or fallback to real_open.
        mode_t mode = 0;
        if (flags & O_CREAT) {
            va_list args;
            va_start(args, flags);
            mode = va_arg(args, mode_t);
            va_end(args);
        }

        if (real_open64) {
            result_fd = (flags & O_CREAT) ? real_open64(pathname, flags, mode) : real_open64(pathname, flags);
        } else {
            sji_log_info("real_open64 not available, falling back to real_open for: %s", pathname);
            result_fd = (flags & O_CREAT) ? real_open(pathname, flags, mode) : real_open(pathname, flags);
        }
    }
    return result_fd;
}

// Intercepted close() call.
int close(int fd) {
    if (!real_close) {
        sji_log_error("CRITICAL: real_close not loaded. Cannot proceed with close call.");
        errno = EFAULT;
        return -1;
    }

    for (size_t i = 0; i < NUM_INTERPOSERS(); i++) {
        // Check if fd is one of our active socket fds.
        if (fd >= 0 && fd == interposers[i].sockfd) {
            sji_log_info("Intercepted 'close' for interposed fd %d (device %s). Closing socket.",
                         fd, interposers[i].open_dev_name);
            int ret = real_close(fd); // Close the actual socket.
            if (ret == 0) {
                // Reset interposer state for this fd.
                interposers[i].sockfd = -1;
                interposers[i].open_flags = 0;
                memset(&(interposers[i].js_config), 0, sizeof(js_config_t));
                sji_log_info("Socket for %s (fd %d) closed and interposer state reset.", interposers[i].open_dev_name, fd);
            } else {
                sji_log_error("real_close on socket fd %d for %s failed: %s.",
                              fd, interposers[i].open_dev_name, strerror(errno));
            }
            return ret; // Return result of closing the socket.
        }
    }
    // Not our fd, pass to real_close.
    return real_close(fd);
}

// Intercepted read() call.
ssize_t read(int fd, void *buf, size_t count) {
    if (!real_read) {
        sji_log_error("CRITICAL: real_read not loaded. Cannot proceed with read call.");
        errno = EFAULT;
        return -1;
    }

    js_interposer_t *interposer = NULL;
    for (size_t i = 0; i < NUM_INTERPOSERS(); i++) {
        if (fd == interposers[i].sockfd && interposers[i].sockfd != -1) {
            interposer = &interposers[i];
            break;
        }
    }

    if (interposer == NULL) { // Not an interposed fd, pass to real_read.
        return real_read(fd, buf, count);
    }

    // Determine expected event size based on interposer type.
    size_t event_size;
    if (interposer->type == DEV_TYPE_JS) {
        event_size = sizeof(struct js_event);
    } else if (interposer->type == DEV_TYPE_EV) {
        event_size = sizeof(struct input_event);
    } else {
        sji_log_error("read: Unknown interposer type %d for fd %d (%s)", interposer->type, fd, interposer->open_dev_name);
        errno = EBADF;
        return -1;
    }

    if (count == 0) return 0; // Standard read behavior.

    // Application buffer must be large enough for at least one event.
    if (count < event_size) {
        sji_log_warn("read for %s (fd %d): app buffer too small (%zu bytes) for one event (%zu bytes).",
                     interposer->open_dev_name, fd, count, event_size);
        errno = EINVAL;
        return -1;
    }

    // Check the actual blocking status of the socket fd.
    // This is important because epoll_ctl might have set it to non-blocking
    // even if the application originally opened the device in blocking mode.
    int socket_actual_flags = fcntl(interposer->sockfd, F_GETFL, 0);
    int socket_is_actually_nonblocking = (socket_actual_flags != -1 && (socket_actual_flags & O_NONBLOCK));

    if (socket_actual_flags == -1) {
        sji_log_warn("read: fcntl(F_GETFL) failed for sockfd %d (%s): %s. Proceeding, assuming blocking status based on open_flags.",
                     interposer->sockfd, interposer->open_dev_name, strerror(errno));
        // Fallback: assume blocking status based on how app opened it (less reliable).
        socket_is_actually_nonblocking = (interposer->open_flags & O_NONBLOCK);
    }
    
    // Read at most one event from the socket.
    // Applications typically read events one by one or in small multiples.
    // If `count` is larger than `event_size`, we still only read one to simplify.
    // A more advanced implementation could try to fill `buf` up to `count`.
    ssize_t bytes_read = recv(interposer->sockfd, buf, event_size, 0);

    if (bytes_read == -1) {
        if (errno == EAGAIN || errno == EWOULDBLOCK) {
            // Expected for non-blocking if no data.
            if (socket_is_actually_nonblocking) {
                 sji_log_debug("read: sockfd %d (%s) non-blocking, no data (EAGAIN/EWOULDBLOCK)", interposer->sockfd, interposer->open_dev_name);
            } else {
                 sji_log_warn("read: sockfd %d (%s) reported as blocking, but got EAGAIN/EWOULDBLOCK. This might indicate an issue or a race condition.", interposer->sockfd, interposer->open_dev_name);
            }
        } else {
            sji_log_error("SOCKET_READ_ERR: read from socket_fd %d (%s) failed: %s (errno %d)",
                          interposer->sockfd, interposer->open_dev_name, strerror(errno), errno);
        }
        // errno is already set by recv.
        return -1;
    } else if (bytes_read == 0) {
        sji_log_info("SOCKET_READ_EOF: read from socket_fd %d (%s) returned 0 (EOF - server closed connection?)",
                     interposer->sockfd, interposer->open_dev_name);
        return 0; // EOF.
    } else {
        sji_log_debug("SOCKET_READ_OK: read %zd bytes from socket_fd %d (%s)",
                     bytes_read, interposer->sockfd, interposer->open_dev_name);
        if (bytes_read < event_size && bytes_read > 0) {
            // This indicates a partial event read, which is unusual for stream sockets
            // if the sender sends full events. Could be problematic for the application.
            sji_log_warn("SOCKET_READ_PARTIAL: read %zd bytes from socket_fd %d (%s), but expected %zu. This might cause issues.",
                         bytes_read, interposer->sockfd, interposer->open_dev_name, event_size);
        }
    }
    return bytes_read;
}

// Intercepted epoll_ctl() call.
int epoll_ctl(int epfd, int op, int fd, struct epoll_event *event) {
    if (!real_epoll_ctl) {
        sji_log_error("CRITICAL: real_epoll_ctl not loaded. Cannot proceed with epoll_ctl call.");
        errno = EFAULT;
        return -1;
    }

    // If adding/modifying an interposed FD, ensure the underlying socket is non-blocking.
    // Epoll is typically used with non-blocking FDs for edge-triggered behavior.
    if (op == EPOLL_CTL_ADD || op == EPOLL_CTL_MOD) {
        for (size_t i = 0; i < NUM_INTERPOSERS(); i++) {
            if (fd == interposers[i].sockfd && interposers[i].sockfd != -1) {
                sji_log_info("epoll_ctl %s for interposed socket fd %d (%s). Ensuring O_NONBLOCK.",
                             (op == EPOLL_CTL_ADD ? "ADD" : "MOD"), fd, interposers[i].open_dev_name);
                if (make_socket_nonblocking(fd) == -1) {
                    // This is a warning because epoll might still work, but behavior could be unexpected
                    // if the socket remains blocking.
                    sji_log_warn("epoll_ctl: Failed to ensure O_NONBLOCK for socket fd %d (%s). Epoll behavior might be affected.",
                                 fd, interposers[i].open_dev_name);
                }
                break; // Found our interposed fd, no need to check further.
            }
        }
    }
    return real_epoll_ctl(epfd, op, fd, event);
}

// --- IOCTL Handling ---

// Handles ioctl calls for interposed joystick devices (DEV_TYPE_JS).
// `fd` is the socket fd, `request` is the ioctl command, `arg` is the argument pointer.
int intercept_js_ioctl(js_interposer_t *interposer, int fd, ioctl_request_t request, void *arg) {
    int len;
    uint8_t *u8_ptr;
    uint16_t *u16_ptr;
    int ret_val = 0;
    errno = 0; // Clear errno before processing, set it appropriately on error.

    // Check if it's a joystick ioctl type ('j').
    if (_IOC_TYPE(request) != 'j') {
        sji_log_warn("IOCTL_JS(%s): Received non-joystick ioctl 0x%lx (Type '%c', NR 0x%02x) on JS device. Setting ENOTTY.",
                       interposer->open_dev_name, (unsigned long)request, _IOC_TYPE(request), _IOC_NR(request));
        errno = ENOTTY;
        ret_val = -1;
        goto exit_js_ioctl;
    }

    switch (_IOC_NR(request)) {
    case 0x01: // JSIOCGVERSION: Get driver version.
        if (!arg) { errno = EFAULT; ret_val = -1; break; }
        *((uint32_t *)arg) = JS_VERSION; // Standard joystick version.
        sji_log_info("IOCTL_JS(%s): JSIOCGVERSION -> 0x%08x", interposer->open_dev_name, JS_VERSION);
        break;
    case 0x11: // JSIOCGAXES: Get number of axes.
        if (!arg) { errno = EFAULT; ret_val = -1; break; }
        *((uint8_t *)arg) = interposer->js_config.num_axes;
        sji_log_info("IOCTL_JS(%s): JSIOCGAXES -> %u (from server config)", interposer->open_dev_name, interposer->js_config.num_axes);
        break;
    case 0x12: // JSIOCGBUTTONS: Get number of buttons.
        if (!arg) { errno = EFAULT; ret_val = -1; break; }
        *((uint8_t *)arg) = interposer->js_config.num_btns;
        sji_log_info("IOCTL_JS(%s): JSIOCGBUTTONS -> %u (from server config)", interposer->open_dev_name, interposer->js_config.num_btns);
        break;
    case 0x13: // JSIOCGNAME(len): Get identifier string.
        len = _IOC_SIZE(request);
        if (!arg || len <= 0) { errno = EFAULT; ret_val = -1; break; }
        // Use hardcoded name for consistency with fake_udev, not server-provided name.
        strncpy((char *)arg, FAKE_UDEV_DEVICE_NAME, len -1 );
        ((char *)arg)[len - 1] = '\0'; // Ensure null termination.
        sji_log_info("IOCTL_JS(%s): JSIOCGNAME(%d) -> '%s' (Hardcoded for fake_udev sync)",
                     interposer->open_dev_name, len, FAKE_UDEV_DEVICE_NAME);
        ret_val = strlen((char*)arg); // Return length of string copied (excluding null).
        break;
    case 0x21: // JSIOCSCORR: Set correction values.
        if (!arg || _IOC_SIZE(request) != sizeof(js_corr_t)) { errno = EINVAL; ret_val = -1; break; }
        memcpy(&interposer->corr, arg, sizeof(js_corr_t));
        sji_log_info("IOCTL_JS(%s): JSIOCSCORR (noop, correction data stored)", interposer->open_dev_name);
        break;
    case 0x22: // JSIOCGCORR: Get correction values.
        if (!arg || _IOC_SIZE(request) != sizeof(js_corr_t)) { errno = EINVAL; ret_val = -1; break; }
        memcpy(arg, &interposer->corr, sizeof(js_corr_t)); // Return stored correction data.
        sji_log_info("IOCTL_JS(%s): JSIOCGCORR (returned stored data)", interposer->open_dev_name);
        break;
    case 0x31: // JSIOCSAXMAP: Set axis mapping (Not supported, config comes from server).
        sji_log_warn("IOCTL_JS(%s): JSIOCSAXMAP (not supported, config from socket). Setting EPERM.", interposer->open_dev_name);
        errno = EPERM; ret_val = -1; break;
    case 0x32: // JSIOCGAXMAP: Get axis mapping.
        if (!arg) { errno = EFAULT; ret_val = -1; break; }
        u8_ptr = (uint8_t *)arg;
        if (_IOC_SIZE(request) < interposer->js_config.num_axes * sizeof(uint8_t) ||
            interposer->js_config.num_axes > INTERPOSER_MAX_AXES) {
            sji_log_error("IOCTL_JS(%s): JSIOCGAXMAP invalid size/count. ReqSize: %u, CfgAxes: %u. Setting EINVAL.",
                          interposer->open_dev_name, _IOC_SIZE(request), interposer->js_config.num_axes);
            errno = EINVAL; ret_val = -1; break;
        }
        memcpy(u8_ptr, interposer->js_config.axes_map, interposer->js_config.num_axes * sizeof(uint8_t));
        sji_log_info("IOCTL_JS(%s): JSIOCGAXMAP (%u axes from server config)", interposer->open_dev_name, interposer->js_config.num_axes);
        break;
    case 0x33: // JSIOCSBTNMAP: Set button mapping (Not supported).
        sji_log_warn("IOCTL_JS(%s): JSIOCSBTNMAP (not supported, config from socket). Setting EPERM.", interposer->open_dev_name);
        errno = EPERM; ret_val = -1; break;
    case 0x34: // JSIOCGBTNMAP: Get button mapping.
        if (!arg) { errno = EFAULT; ret_val = -1; break; }
        u16_ptr = (uint16_t *)arg;
        if (_IOC_SIZE(request) < interposer->js_config.num_btns * sizeof(uint16_t) ||
            interposer->js_config.num_btns > INTERPOSER_MAX_BTNS) {
            sji_log_error("IOCTL_JS(%s): JSIOCGBTNMAP invalid size/count. ReqSize: %u, CfgBtns: %u. Setting EINVAL.",
                          interposer->open_dev_name, _IOC_SIZE(request), interposer->js_config.num_btns);
            errno = EINVAL; ret_val = -1; break;
        }
        memcpy(u16_ptr, interposer->js_config.btn_map, interposer->js_config.num_btns * sizeof(uint16_t));
        sji_log_info("IOCTL_JS(%s): JSIOCGBTNMAP (%u buttons from server config)", interposer->open_dev_name, interposer->js_config.num_btns);
        break;
    default:
        sji_log_warn("IOCTL_JS(%s): Unhandled joystick ioctl request 0x%lx (NR=0x%02x). Setting ENOTTY.",
                     interposer->open_dev_name, (unsigned long)request, _IOC_NR(request));
        errno = ENOTTY; // Command not understood or not implemented.
        ret_val = -1;
        break;
    }

exit_js_ioctl:
    // Ensure errno is set if ret_val is -1 and clear if ret_val is 0 or positive.
    if (ret_val < 0 && errno == 0) {
        errno = ENOTTY; // Default error if none was explicitly set.
    } else if (ret_val >= 0) {
        errno = 0; // Success means no error.
    }
    sji_log_debug("IOCTL_JS_RETURN(%s): req=0x%lx, ret_val=%d, errno=%d (%s)",
                 interposer->open_dev_name, (unsigned long)request, ret_val, errno, (errno != 0 ? strerror(errno) : "Success"));
    return ret_val;
}

// Handles ioctl calls for interposed event devices (DEV_TYPE_EV).
// `fd` is the socket fd, `request` is the ioctl command, `arg` is the argument pointer.
int intercept_ev_ioctl(js_interposer_t *interposer, int fd, ioctl_request_t request, void *arg) {
    struct input_absinfo *absinfo_ptr;
    struct input_id *id_ptr;
    struct ff_effect *effect_s_ptr; // For EVIOCSFF (set force feedback effect)
    int effect_id_val;             // For EVIOCRMFF (remove force feedback effect)
    int ev_version = 0x010001;     // EV_VERSION (Input Protocol Version 1.0.1)
    int len;
    unsigned int i;
    int ret_val = 0;
    errno = 0; // Clear errno before processing.

    char ioctl_type = _IOC_TYPE(request);
    unsigned int ioctl_nr = _IOC_NR(request);
    unsigned int ioctl_size = _IOC_SIZE(request);

    if (ioctl_type == 'E') { // Standard EVDEV ioctls
        // Handle EVIOCGABS(abs_code): Get abs value info (e.g., min, max, fuzz for an axis)
        if (ioctl_nr >= _IOC_NR(EVIOCGABS(0)) && ioctl_nr < (_IOC_NR(EVIOCGABS(0)) + ABS_CNT)) {
            uint8_t abs_code = ioctl_nr - _IOC_NR(EVIOCGABS(0)); // Extract axis code from ioctl number.
            if (!arg || ioctl_size < sizeof(struct input_absinfo)) { errno = EFAULT; ret_val = -1; goto exit_ev_ioctl; }
            absinfo_ptr = (struct input_absinfo *)arg;
            memset(absinfo_ptr, 0, sizeof(struct input_absinfo));

            // Populate with generic defaults, then specialize.
            absinfo_ptr->value = 0; // Current value (typically 0 at start).
            absinfo_ptr->minimum = ABS_AXIS_MIN_DEFAULT;
            absinfo_ptr->maximum = ABS_AXIS_MAX_DEFAULT;
            absinfo_ptr->fuzz = 16;
            absinfo_ptr->flat = 128;
            absinfo_ptr->resolution = 0;

            // Specific defaults for triggers (LT/RT)
            if (abs_code == ABS_Z || abs_code == ABS_RZ) {
                absinfo_ptr->minimum = ABS_TRIGGER_MIN_DEFAULT;
                absinfo_ptr->maximum = ABS_TRIGGER_MAX_DEFAULT;
                absinfo_ptr->fuzz = 0;
                absinfo_ptr->flat = 0;
            } else if (abs_code == ABS_HAT0X || abs_code == ABS_HAT0Y) { // D-pad axes
                absinfo_ptr->minimum = ABS_HAT_MIN_DEFAULT;
                absinfo_ptr->maximum = ABS_HAT_MAX_DEFAULT;
                absinfo_ptr->fuzz = 0;
                absinfo_ptr->flat = 0;
            } else if (abs_code != ABS_X && abs_code != ABS_Y && abs_code != ABS_RX && abs_code != ABS_RY) {
                 sji_log_debug("IOCTL_EV(%s): EVIOCGABS(0x%02x) - axis not a standard X360 analog stick, using general defaults.",
                             interposer->open_dev_name, abs_code);
            }
            sji_log_info("IOCTL_EV(%s): EVIOCGABS(0x%02x)", interposer->open_dev_name, abs_code);
            goto exit_ev_ioctl; // ret_val is 0 (success) by default
        }

        // Handle EVIOCGNAME(len): Get device name.
        if (ioctl_nr == _IOC_NR(EVIOCGNAME(0))) {
            len = ioctl_size;
            if (!arg || len <= 0) { errno = EFAULT; ret_val = -1; goto exit_ev_ioctl; }
            strncpy((char *)arg, FAKE_UDEV_DEVICE_NAME, len - 1); // Use hardcoded name.
            ((char *)arg)[len - 1] = '\0';
            sji_log_info("IOCTL_EV(%s): EVIOCGNAME(%d) -> '%s' (Hardcoded for fake_udev sync)",
                         interposer->open_dev_name, len, FAKE_UDEV_DEVICE_NAME);
            ret_val = strlen((char *)arg); // Return length of string copied.
            goto exit_ev_ioctl;
        }

        // Handle EVIOCGPROP(len): Get device properties.
        if (ioctl_nr == _IOC_NR(EVIOCGPROP(0))) {
            len = ioctl_size;
            if (!arg || len <=0 ) { errno = EFAULT; ret_val = -1; goto exit_ev_ioctl; }
            memset(arg, 0, len); // Report no specific input properties (e.g., INPUT_PROP_BUTTONPAD).
            sji_log_info("IOCTL_EV(%s): EVIOCGPROP(%d) (0 props reported)", interposer->open_dev_name, len);
            ret_val = 0; // Number of bytes for properties (0 if no properties).
            goto exit_ev_ioctl;
        }

        // Handle EVIOCGKEY(len): Get current key/button state (report all up).
        if (ioctl_nr == _IOC_NR(EVIOCGKEY(0))) {
            len = ioctl_size;
            if (!arg || len <=0) { errno = EFAULT; ret_val = -1; goto exit_ev_ioctl; }
            memset(arg, 0, len); // All bits 0 means all keys are up.
            sji_log_info("IOCTL_EV(%s): EVIOCGKEY(%d) (all keys reported up)", interposer->open_dev_name, len);
            ret_val = len; // Should return number of bytes copied, which is len.
            goto exit_ev_ioctl;
        }

        // Handle EVIOCGBIT(ev_type, len): Get event type or specific type bits.
        if (ioctl_nr >= _IOC_NR(EVIOCGBIT(0,0)) && ioctl_nr < _IOC_NR(EVIOCGBIT(EV_MAX,0))) {
            unsigned char ev_type_query = ioctl_nr - _IOC_NR(EVIOCGBIT(0,0)); // Extract event type being queried.
            len = ioctl_size;
            if (!arg || len <=0) { errno = EFAULT; ret_val = -1; goto exit_ev_ioctl; }
            memset(arg, 0, len); // Initialize buffer to all zeros.

            if (ev_type_query == 0) { // Query for supported event types (EV_SYN, EV_KEY, etc.)
                // Set bits for generally supported event types.
                if (EV_SYN / 8 < len) ((unsigned char *)arg)[EV_SYN / 8] |= (1 << (EV_SYN % 8));
                if (EV_KEY / 8 < len) ((unsigned char *)arg)[EV_KEY / 8] |= (1 << (EV_KEY % 8));
                if (EV_ABS / 8 < len) ((unsigned char *)arg)[EV_ABS / 8] |= (1 << (EV_ABS % 8));
                if (EV_FF  / 8 < len) ((unsigned char *)arg)[EV_FF  / 8] |= (1 << (EV_FF  % 8)); // Force Feedback
                sji_log_info("IOCTL_EV(%s): EVIOCGBIT(type 0x00 - General Caps, len %d) -> EV_SYN, EV_KEY, EV_ABS, EV_FF",
                             interposer->open_dev_name, len);
            } else if (ev_type_query == EV_KEY) { // Query for supported keys/buttons.
                for (i = 0; i < interposer->js_config.num_btns; ++i) {
                    int key_code = interposer->js_config.btn_map[i]; // Get key code from server config.
                    if (key_code >= 0 && key_code < KEY_MAX && (key_code / 8 < len)) {
                        ((unsigned char *)arg)[key_code / 8] |= (1 << (key_code % 8));
                    }
                }
                sji_log_info("IOCTL_EV(%s): EVIOCGBIT(type 0x%02x - EV_KEY, len %d, num_btns_cfg %u from server)",
                             interposer->open_dev_name, ev_type_query, len, interposer->js_config.num_btns);
            } else if (ev_type_query == EV_ABS) { // Query for supported absolute axes.
                for (i = 0; i < interposer->js_config.num_axes; ++i) {
                    int abs_code = interposer->js_config.axes_map[i]; // Get axis code from server config.
                     if (abs_code >= 0 && abs_code < ABS_MAX && (abs_code / 8 < len)) {
                        ((unsigned char *)arg)[abs_code / 8] |= (1 << (abs_code % 8));
                     }
                }
                sji_log_info("IOCTL_EV(%s): EVIOCGBIT(type 0x%02x - EV_ABS, len %d, num_axes_cfg %u from server)",
                             interposer->open_dev_name, ev_type_query, len, interposer->js_config.num_axes);
            } else if (ev_type_query == EV_FF) { // Query for supported force feedback effects.
                // Minimal support: report FF_RUMBLE.
                if (FF_RUMBLE / 8 < len) ((unsigned char *)arg)[FF_RUMBLE / 8] |= (1 << (FF_RUMBLE % 8));
                sji_log_info("IOCTL_EV(%s): EVIOCGBIT(type 0x%02x - EV_FF, len %d) -> FF_RUMBLE",
                             interposer->open_dev_name, ev_type_query, len);
            } else {
                sji_log_info("IOCTL_EV(%s): EVIOCGBIT(type 0x%02x - Other, len %d) -> No bits set",
                             interposer->open_dev_name, ev_type_query, len);
            }
            ret_val = len; // Return number of bytes for the bitmap.
            goto exit_ev_ioctl;
        }

        // Handle specific EVDEV ioctls by exact request code.
        switch (request) {
            case EVIOCGVERSION: // Get device version.
                if (!arg || ioctl_size < sizeof(int)) { errno = EFAULT; ret_val = -1; break; }
                *((int *)arg) = ev_version;
                sji_log_info("IOCTL_EV(%s): EVIOCGVERSION -> 0x%08x", interposer->open_dev_name, ev_version);
                break;
            case EVIOCGID: // Get device ID (bustype, vendor, product, version).
                if (!arg || ioctl_size < sizeof(struct input_id)) { errno = EFAULT; ret_val = -1; break; }
                id_ptr = (struct input_id *)arg;
                memset(id_ptr, 0, sizeof(struct input_id));
                id_ptr->bustype = FAKE_UDEV_BUS_TYPE;
                id_ptr->vendor  = FAKE_UDEV_VENDOR_ID;
                id_ptr->product = FAKE_UDEV_PRODUCT_ID;
                id_ptr->version = FAKE_UDEV_VERSION_ID;
                sji_log_info("IOCTL_EV(%s): EVIOCGID -> bus:0x%04x, ven:0x%04x, prod:0x%04x, ver:0x%04x (Hardcoded for fake_udev sync)",
                               interposer->open_dev_name, id_ptr->bustype, id_ptr->vendor, id_ptr->product, id_ptr->version);
                break;
            case EVIOCGRAB: // Grab/ungrab device (exclusive access).
                // We don't actually grab, but report success to allow apps to proceed.
                sji_log_info("IOCTL_EV(%s): EVIOCGRAB (noop, success reported)", interposer->open_dev_name);
                break; // ret_val is 0 (success).
            case EVIOCSFF: // Upload a force feedback effect.
                if (!arg || ioctl_size < sizeof(struct ff_effect)) { errno = EFAULT; ret_val = -1; break; }
                effect_s_ptr = (struct ff_effect *)arg;
                // Noop, but assign an ID if requested (-1) and return it.
                sji_log_info("IOCTL_EV(%s): EVIOCSFF (type: 0x%x, id_in: %d) (noop, returns id)",
                               interposer->open_dev_name, effect_s_ptr->type, effect_s_ptr->id);
                effect_s_ptr->id = (effect_s_ptr->id == -1) ? 1 : effect_s_ptr->id; // Assign a dummy ID.
                ret_val = effect_s_ptr->id; // Return the effect ID.
                break;
            case EVIOCRMFF: // Remove a force feedback effect.
                // Argument is the effect ID, passed directly as 'arg' if it fits intptr_t.
                effect_id_val = (int)(intptr_t)arg;
                sji_log_info("IOCTL_EV(%s): EVIOCRMFF (id: %d) (noop, success reported)", interposer->open_dev_name, effect_id_val);
                break; // ret_val is 0 (success).
            case EVIOCGEFFECTS: // Get number of simultaneous effects device can play.
                if (!arg || ioctl_size < sizeof(int)) { errno = EFAULT; ret_val = -1; break; }
                *(int *)arg = 1; // Report 1 effect slot (minimal support).
                sji_log_info("IOCTL_EV(%s): EVIOCGEFFECTS -> %d", interposer->open_dev_name, *(int *)arg);
                break;
            default: // Unhandled EVDEV ioctl.
                sji_log_warn("IOCTL_EV(%s): Unhandled EVDEV ioctl request 0x%lx (Type 'E', NR 0x%02x, Size %u). Setting ENOTTY.",
                               interposer->open_dev_name, (unsigned long)request, ioctl_nr, ioctl_size);
                errno = ENOTTY;
                ret_val = -1;
                break;
        }
    } else if (ioctl_type == 'j') { // Joystick compatibility ioctls on an EVDEV device.
        sji_log_info("IOCTL_EV_COMPAT(%s): Joystick ioctl 0x%lx (Type 'j', NR 0x%02x) on EVDEV device. Delegating to JS handler.",
                       interposer->open_dev_name, (unsigned long)request, ioctl_nr);
        // Some applications might try js-specific ioctls on an event device.
        // Delegate to the joystick ioctl handler for compatibility.
        return intercept_js_ioctl(interposer, fd, request, arg);
    } else { // Unknown ioctl type.
        sji_log_warn("IOCTL_EV(%s): Received ioctl with unexpected type '%c' (request 0x%lx, NR 0x%02x). Setting ENOTTY.",
                       interposer->open_dev_name, ioctl_type, (unsigned long)request, ioctl_nr);
        errno = ENOTTY;
        ret_val = -1;
    }

exit_ev_ioctl:
    if (ret_val < 0 && errno == 0) {
        errno = ENOTTY; // Default error if none was explicitly set.
    } else if (ret_val >= 0) {
        errno = 0; // Success means no error.
    }
    sji_log_debug("IOCTL_EV_RETURN(%s): req=0x%lx, ret_val=%d, errno=%d (%s)",
                 interposer->open_dev_name, (unsigned long)request, ret_val, errno, (errno != 0 ? strerror(errno) : "Success"));
    return ret_val;
}

// Intercepted ioctl() call.
// `fd` is the file descriptor, `request` is the ioctl command, `...` is the argument.
int ioctl(int fd, ioctl_request_t request, ...) {
    if (!real_ioctl) {
        sji_log_error("CRITICAL: real_ioctl not loaded. Cannot proceed with ioctl call.");
        errno = EFAULT;
        return -1;
    }

    // Extract the third argument (pointer) for the ioctl.
    va_list args_list;
    va_start(args_list, request);
    void *arg_ptr = va_arg(args_list, void *);
    va_end(args_list);

    js_interposer_t *interposer = NULL;
    for (size_t i = 0; i < NUM_INTERPOSERS(); i++) {
        if (fd == interposers[i].sockfd && interposers[i].sockfd != -1) {
            interposer = &interposers[i];
            break;
        }
    }

    if (interposer == NULL) { // Not an interposed fd, pass to real_ioctl.
        return real_ioctl(fd, request, arg_ptr);
    }

    // Route to specific ioctl handler based on interposer type.
    if (interposer->type == DEV_TYPE_JS) {
        return intercept_js_ioctl(interposer, fd, request, arg_ptr);
    } else if (interposer->type == DEV_TYPE_EV) {
        return intercept_ev_ioctl(interposer, fd, request, arg_ptr);
    } else {
        sji_log_error("IOCTL(%s): Interposer has unknown type %d for fd %d. This should not happen. Setting EINVAL.",
                       interposer->open_dev_name, interposer->type, fd);
        errno = EINVAL; // Should not happen if interposers array is correctly initialized.
        return -1;
    }
}
