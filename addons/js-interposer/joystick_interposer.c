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

    Key functionalities:
    - Interposes open() to establish socket connections and receive initial
      joystick configuration (name, button/axis maps).
    - Interposes ioctl() to simulate kernel responses for joystick/event devices.
    - Interposes read() to fetch event data from the socket.
    - Interposes close() to clean up socket connections.
    - Interposes epoll_ctl() to manage non-blocking behavior for sockets
      added to epoll sets.

    Setup Note:
    Some applications scan /dev/input/ to find devices. For these, create
    placeholder device files:
        sudo mkdir -pm1777 /dev/input
        sudo touch /dev/input/{js0,js1,js2,js3,event1000,event1001,event1002,event1003}
        sudo chmod 777 /dev/input/js* /dev/input/event*
*/

#define _GNU_SOURCE // Required for RTLD_NEXT
#define _LARGEFILE64_SOURCE 1 // For open64
#include <dlfcn.h>
#include <stdio.h>
#include <stdarg.h>
#include <fcntl.h>
#include <string.h>
#include <stdint.h>
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

#ifdef __GLIBC__
typedef unsigned long ioctl_request_t;
#else
typedef int ioctl_request_t;
#endif

#define LOG_FILE "/tmp/selkies_js.log"
#define SOCKET_CONNECT_TIMEOUT_MS 250

// Device and socket path definitions
#define JS0_DEVICE_PATH "/dev/input/js0"
#define JS0_SOCKET_PATH "/tmp/selkies_js0.sock"
#define JS1_DEVICE_PATH "/dev/input/js1"
#define JS1_SOCKET_PATH "/tmp/selkies_js1.sock"
#define JS2_DEVICE_PATH "/dev/input/js2"
#define JS2_SOCKET_PATH "/tmp/selkies_js2.sock"
#define JS3_DEVICE_PATH "/dev/input/js3"
#define JS3_SOCKET_PATH "/tmp/selkies_js3.sock"
#define NUM_JS_INTERPOSERS 4

#define EV0_DEVICE_PATH "/dev/input/event1000"
#define EV0_SOCKET_PATH "/tmp/selkies_event1000.sock"
#define EV1_DEVICE_PATH "/dev/input/event1001"
#define EV1_SOCKET_PATH "/tmp/selkies_event1001.sock"
#define EV2_DEVICE_PATH "/dev/input/event1002"
#define EV2_SOCKET_PATH "/tmp/selkies_event1002.sock"
#define EV3_DEVICE_PATH "/dev/input/event1003"
#define EV3_SOCKET_PATH "/tmp/selkies_event1003.sock"
#define NUM_EV_INTERPOSERS 4

#define NUM_INTERPOSERS() (NUM_JS_INTERPOSERS + NUM_EV_INTERPOSERS)

// --- Logging ---
static FILE *log_file_fd = NULL;

// Define log levels for clarity in interposer_log calls
#define SJI_LOG_LEVEL_INFO "[INFO]"
#define SJI_LOG_LEVEL_WARN "[WARN]"
#define SJI_LOG_LEVEL_ERROR "[ERROR]"
// SJI_LOG_LEVEL_TRACE could be used for conditional debug builds

static void init_log_file_if_needed() {
    if (log_file_fd == NULL) {
        log_file_fd = fopen(LOG_FILE, "a");
        if (log_file_fd == NULL) {
            log_file_fd = stderr; // Fallback to stderr
            fprintf(log_file_fd, "[%lu][SJI][ERROR][init_log_file_if_needed:%d] Failed to open log file %s, using stderr. Error: %s\n",
                    (unsigned long)time(NULL), __LINE__, LOG_FILE, strerror(errno));
        }
    }
}

static void interposer_log(const char *level, const char *func_name, int line_num, const char *format, ...) {
    init_log_file_if_needed();
    va_list argp;
    fprintf(log_file_fd, "[%lu][SJI]%s[%s:%d] ", (unsigned long)time(NULL), level, func_name, line_num);
    va_start(argp, format);
    vfprintf(log_file_fd, format, argp);
    va_end(argp);
    fprintf(log_file_fd, "\n");
    fflush(log_file_fd);
}

// Simplified logging macros
#define sji_log_info(...) interposer_log(SJI_LOG_LEVEL_INFO, __func__, __LINE__, __VA_ARGS__)
#define sji_log_warn(...) interposer_log(SJI_LOG_LEVEL_WARN, __func__, __LINE__, __VA_ARGS__)
#define sji_log_error(...) interposer_log(SJI_LOG_LEVEL_ERROR, __func__, __LINE__, __VA_ARGS__)

// --- Real Function Pointers & Loading ---
static int (*real_open)(const char *pathname, int flags, ...) = NULL;
static int (*real_open64)(const char *pathname, int flags, ...) = NULL;
static int (*real_ioctl)(int fd, ioctl_request_t request, ...) = NULL;
static int (*real_epoll_ctl)(int epfd, int op, int fd, struct epoll_event *event) = NULL;
static int (*real_close)(int fd) = NULL;
static ssize_t (*real_read)(int fd, void *buf, size_t count) = NULL;

static int load_real_func(void (**target_func_ptr)(void), const char *name) {
    if (*target_func_ptr != NULL) return 0; // Already loaded
    *target_func_ptr = dlsym(RTLD_NEXT, name);
    if (*target_func_ptr == NULL) {
        // Use fprintf directly to avoid potential recursion if logging itself fails during early init
        init_log_file_if_needed();
        fprintf(log_file_fd, "[%lu][SJI][ERROR][load_real_func:%d] Failed to load real '%s': %s\n",
                (unsigned long)time(NULL), __LINE__, name, dlerror());
        fflush(log_file_fd);
        return -1;
    }
    return 0;
}

// --- Data Structures ---
typedef struct js_corr js_corr_t; // Forward declaration for js_interposer_t

#define CONTROLLER_NAME_MAX_LEN 255
#define INTERPOSER_MAX_BTNS 512
#define INTERPOSER_MAX_AXES 64

// Configuration received from the socket server for a joystick.
typedef struct {
    char name[CONTROLLER_NAME_MAX_LEN];
    uint16_t vendor;
    uint16_t product;
    uint16_t version;
    uint16_t num_btns;
    uint16_t num_axes;
    uint16_t btn_map[INTERPOSER_MAX_BTNS];  // Maps logical button index to kernel KEY_ or BTN_ codes
    uint8_t axes_map[INTERPOSER_MAX_AXES]; // Maps logical axis index to kernel ABS_ codes
    uint8_t final_alignment_padding[6]; // Ensures consistent struct size across architectures
} js_config_t;

// State for a single interposed device.
typedef struct {
    uint8_t type;                 // DEV_TYPE_JS or DEV_TYPE_EV
    char open_dev_name[255];      // e.g., "/dev/input/js0"
    char socket_path[255];        // e.g., "/tmp/selkies_js0.sock"
    int sockfd;                   // FD for the Unix domain socket connection, -1 if not open
    int open_flags;               // Flags used by the application when opening open_dev_name
    js_corr_t corr;               // Correction values for JSIOCSCORR/JSIOCGCORR (js devices only)
    js_config_t js_config;        // Configuration received from socket
} js_interposer_t;

#define DEV_TYPE_JS 0
#define DEV_TYPE_EV 1

// Default values for EVIOCGABS ioctl responses.
#define ABS_AXIS_MIN_DEFAULT -32767
#define ABS_AXIS_MAX_DEFAULT 32767
#define ABS_TRIGGER_MIN_DEFAULT 0
#define ABS_TRIGGER_MAX_DEFAULT 255
#define ABS_HAT_MIN_DEFAULT -1
#define ABS_HAT_MAX_DEFAULT 1

// Global array of interposer states.
static js_interposer_t interposers[NUM_INTERPOSERS()] = {
    { DEV_TYPE_JS, JS0_DEVICE_PATH, JS0_SOCKET_PATH, -1, 0, {0}, {0} },
    { DEV_TYPE_JS, JS1_DEVICE_PATH, JS1_SOCKET_PATH, -1, 0, {0}, {0} },
    { DEV_TYPE_JS, JS2_DEVICE_PATH, JS2_SOCKET_PATH, -1, 0, {0}, {0} },
    { DEV_TYPE_JS, JS3_DEVICE_PATH, JS3_SOCKET_PATH, -1, 0, {0}, {0} },
    { DEV_TYPE_EV, EV0_DEVICE_PATH, EV0_SOCKET_PATH, -1, 0, {0}, {0} },
    { DEV_TYPE_EV, EV1_DEVICE_PATH, EV1_SOCKET_PATH, -1, 0, {0}, {0} },
    { DEV_TYPE_EV, EV2_DEVICE_PATH, EV2_SOCKET_PATH, -1, 0, {0}, {0} },
    { DEV_TYPE_EV, EV3_DEVICE_PATH, EV3_SOCKET_PATH, -1, 0, {0}, {0} },
};

// --- Initialization ---
__attribute__((constructor)) void init_interposer() {
    init_log_file_if_needed(); // Ensure log file is ready
    if (load_real_func((void *)&real_open, "open") < 0) sji_log_error("CRITICAL: Failed to load real 'open'.");
    if (load_real_func((void *)&real_ioctl, "ioctl") < 0) sji_log_error("CRITICAL: Failed to load real 'ioctl'.");
    if (load_real_func((void *)&real_epoll_ctl, "epoll_ctl") < 0) sji_log_error("CRITICAL: Failed to load real 'epoll_ctl'.");
    if (load_real_func((void *)&real_close, "close") < 0) sji_log_error("CRITICAL: Failed to load real 'close'.");
    if (load_real_func((void *)&real_read, "read") < 0) sji_log_error("CRITICAL: Failed to load real 'read'.");
    load_real_func((void *)&real_open64, "open64");
}

// --- Helper Functions ---
// Sets O_NONBLOCK on the given socket FD if not already set.
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
    }
    return 0;
}

// Reads the js_config_t structure from the socket.
// Temporarily makes the socket blocking for this read if it was non-blocking.
static int read_socket_config(int sockfd, js_config_t *config_dest) {
    ssize_t bytes_to_read = sizeof(js_config_t);
    ssize_t bytes_read_total = 0;
    char *buffer_ptr = (char *)config_dest;

    int original_socket_flags = fcntl(sockfd, F_GETFL, 0);
    int socket_was_nonblocking = 0;

    if (original_socket_flags != -1 && (original_socket_flags & O_NONBLOCK)) {
        socket_was_nonblocking = 1;
        if (fcntl(sockfd, F_SETFL, original_socket_flags & ~O_NONBLOCK) == -1) {
            sji_log_warn("read_socket_config: Failed to make sockfd %d blocking for config read: %s. Proceeding.", sockfd, strerror(errno));
            // Continue, but read might be non-blocking
        }
    } else if (original_socket_flags == -1) {
        sji_log_warn("read_socket_config: fcntl(F_GETFL) failed for sockfd %d: %s. Cannot ensure blocking for config read.", sockfd, strerror(errno));
    }

    sji_log_info("Attempting to read joystick config (%zd bytes) from sockfd %d.", bytes_to_read, sockfd);
    while (bytes_read_total < bytes_to_read) {
        ssize_t current_read = real_read(sockfd, buffer_ptr + bytes_read_total, bytes_to_read - bytes_read_total);
        if (current_read == -1) {
            if (errno == EAGAIN || errno == EWOULDBLOCK) { // Should not happen if we successfully made it blocking
                sji_log_warn("read_socket_config: real_read on sockfd %d returned EAGAIN/EWOULDBLOCK. Retrying.", sockfd);
                usleep(10000); // 10ms
                continue;
            }
            sji_log_error("read_socket_config: real_read failed on sockfd %d: %s", sockfd, strerror(errno));
            goto config_read_error;
        } else if (current_read == 0) {
            sji_log_error("read_socket_config: EOF on sockfd %d after %zd bytes (expected %zd). Peer closed connection?", sockfd, bytes_read_total, bytes_to_read);
            goto config_read_error;
        }
        bytes_read_total += current_read;
    }

    sji_log_info("Successfully read joystick config from sockfd %d: Name='%s', Vnd=0x%x, Prd=0x%x, Btns=%u, Axes=%u",
                 sockfd, config_dest->name, config_dest->vendor, config_dest->product,
                 config_dest->num_btns, config_dest->num_axes);

    if (strnlen(config_dest->name, CONTROLLER_NAME_MAX_LEN) == CONTROLLER_NAME_MAX_LEN) {
        config_dest->name[CONTROLLER_NAME_MAX_LEN-1] = '\0'; // Ensure null termination
        sji_log_warn("Config name was not null-terminated by server; forced.");
    }

config_read_error: // Restore socket flags before returning on success or error
    if (socket_was_nonblocking && original_socket_flags != -1) {
        if (fcntl(sockfd, F_SETFL, original_socket_flags) == -1) { // original_socket_flags includes O_NONBLOCK
            sji_log_warn("read_socket_config: Failed to restore O_NONBLOCK to sockfd %d: %s", sockfd, strerror(errno));
        }
    }
    return (bytes_read_total == bytes_to_read) ? 0 : -1;
}

// Establishes connection to the Unix domain socket for an interposer.
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
    sji_log_info("Attempting to connect to %s (fd %d)...", interposer->socket_path, interposer->sockfd);
    while (connect(interposer->sockfd, (struct sockaddr *)&addr, sizeof(struct sockaddr_un)) == -1) {
        if (errno == ENOENT || errno == ECONNREFUSED) {
            if (++attempt >= SOCKET_CONNECT_TIMEOUT_MS / 10) { // Log every 10ms of retries
                 sji_log_warn("Connection to %s refused/not found, retrying (%dms)...", interposer->socket_path, attempt * 10);
            }
             if (attempt * 10 > SOCKET_CONNECT_TIMEOUT_MS) { // Check against total timeout
                sji_log_error("Timed out connecting to socket %s after %dms.", interposer->socket_path, SOCKET_CONNECT_TIMEOUT_MS);
                goto connect_fail;
            }
            usleep(10000); // Wait 10ms before retrying
            continue;
        }
        sji_log_error("Failed to connect to socket %s: %s", interposer->socket_path, strerror(errno));
        goto connect_fail;
    }
    sji_log_info("Connected to socket %s (fd %d).", interposer->socket_path, interposer->sockfd);

    if (read_socket_config(interposer->sockfd, &(interposer->js_config)) != 0) {
        sji_log_error("Failed to read config from socket %s.", interposer->socket_path);
        goto connect_fail;
    }

    unsigned char arch_byte[1] = { (unsigned char)sizeof(long) }; // sizeof(long) indicates 32-bit or 64-bit architecture
    sji_log_info("Sending architecture specifier (%u bytes) to %s.", arch_byte[0], interposer->socket_path);
    if (write(interposer->sockfd, arch_byte, sizeof(arch_byte)) != sizeof(arch_byte)) {
        sji_log_error("Failed to send architecture specifier to %s: %s", interposer->socket_path, strerror(errno));
        goto connect_fail;
    }
    return 0;

connect_fail:
    if (interposer->sockfd != -1) {
        real_close(interposer->sockfd);
        interposer->sockfd = -1;
    }
    return -1;
}

// --- Interposed Functions ---

// Handles common logic for open() and open64().
static int common_open_logic(const char *pathname, int flags, js_interposer_t **found_interposer_ptr) {
    *found_interposer_ptr = NULL;
    for (size_t i = 0; i < NUM_INTERPOSERS(); i++) {
        if (strcmp(pathname, interposers[i].open_dev_name) == 0) {
            if (interposers[i].sockfd != -1) {
                sji_log_info("Device %s already open via interposer (fd %d, app_flags_orig=0x%x, new_req_flags=0x%x). Reusing.",
                             pathname, interposers[i].sockfd, interposers[i].open_flags, flags);
                *found_interposer_ptr = &interposers[i];
                // Important: Do not update interposers[i].open_flags here.
                // The original open flags determine the device's emulated behavior.
                return interposers[i].sockfd;
            }

            // Store the flags used by the application to open the device path.
            // This helps `read()` decide its behavior.
            interposers[i].open_flags = flags;

            if (connect_interposer_socket(&interposers[i]) == -1) {
                sji_log_error("Failed to establish socket connection for %s.", pathname);
                interposers[i].open_flags = 0; // Clear flags on failure
                errno = EIO; // Generic I/O error for application
                return -1;
            }
            *found_interposer_ptr = &interposers[i];
            sji_log_info("Successfully interposed 'open' for %s (app_flags=0x%x), socket fd: %d.",
                         pathname, flags, interposers[i].sockfd);
            return interposers[i].sockfd;
        }
    }
    return -2; // Pathname not managed by this interposer
}

int open(const char *pathname, int flags, ...) {
    if (!real_open) { sji_log_error("CRITICAL: real_open not loaded."); errno = EFAULT; return -1; }

    js_interposer_t *interposer = NULL;
    int result_fd = common_open_logic(pathname, flags, &interposer);

    if (result_fd == -2) { // Not an interposed path
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
    return result_fd;
}

#ifdef open64
#undef open64
#endif
int open64(const char *pathname, int flags, ...) {
    if (!real_open64 && !real_open) { sji_log_error("CRITICAL: Neither real_open64 nor real_open loaded."); errno = EFAULT; return -1; }

    js_interposer_t *interposer = NULL;
    int result_fd = common_open_logic(pathname, flags, &interposer);

    if (result_fd == -2) { // Not an interposed path
        mode_t mode = 0;
        if (flags & O_CREAT) {
            va_list args;
            va_start(args, flags);
            mode = va_arg(args, mode_t);
            va_end(args);
        }
        if (real_open64) {
            result_fd = (flags & O_CREAT) ? real_open64(pathname, flags, mode) : real_open64(pathname, flags);
        } else { // Fallback to real_open if real_open64 is not available
            sji_log_info("real_open64 not available, falling back to real_open for: %s", pathname);
            result_fd = (flags & O_CREAT) ? real_open(pathname, flags, mode) : real_open(pathname, flags);
        }
    }
    return result_fd;
}

int close(int fd) {
    if (!real_close) { sji_log_error("CRITICAL: real_close not loaded."); errno = EFAULT; return -1; }

    for (size_t i = 0; i < NUM_INTERPOSERS(); i++) {
        if (fd >= 0 && fd == interposers[i].sockfd) {
            sji_log_info("Intercepted 'close' for interposed fd %d (device %s). Closing socket.",
                         fd, interposers[i].open_dev_name);
            int ret = real_close(fd); // Close the actual socket
            if (ret == 0) {
                interposers[i].sockfd = -1;
                interposers[i].open_flags = 0;
                memset(&(interposers[i].js_config), 0, sizeof(js_config_t));
            } else {
                sji_log_error("real_close on socket fd %d for %s failed: %s.",
                              fd, interposers[i].open_dev_name, strerror(errno));
            }
            return ret;
        }
    }
    return real_close(fd); // Not an interposed fd
}

ssize_t read(int fd, void *buf, size_t count) {
    if (!real_read) { sji_log_error("CRITICAL: real_read not loaded."); errno = EFAULT; return -1; }

    js_interposer_t *interposer = NULL;
    for (size_t i = 0; i < NUM_INTERPOSERS(); i++) {
        if (fd == interposers[i].sockfd && interposers[i].sockfd != -1) {
            interposer = &interposers[i];
            break;
        }
    }

    if (interposer == NULL) { // Not an interposed fd
        return real_read(fd, buf, count);
    }

    // Determine event size based on interposer type (JS or EV)
    size_t event_size;
    if (interposer->type == DEV_TYPE_JS) {
        event_size = sizeof(struct js_event);
    } else if (interposer->type == DEV_TYPE_EV) {
        event_size = (2 * sizeof(long)) + sizeof(uint16_t) + sizeof(uint16_t) + sizeof(int32_t); // sizeof(struct input_event)
    } else {
        sji_log_error("read: Unknown interposer type %d for fd %d (%s)", interposer->type, fd, interposer->open_dev_name);
        errno = EBADF;
        return -1;
    }

    if (count == 0) return 0;
    if (count < event_size) {
        sji_log_warn("read for %s (fd %d): app buffer too small (%zu bytes) for one event (%zu bytes).",
                     interposer->open_dev_name, fd, count, event_size);
        errno = EINVAL;
        return -1;
    }

    // Check if the underlying interposer socket is non-blocking
    // This is typically set if the application uses epoll with this fd.
    int socket_flags = fcntl(interposer->sockfd, F_GETFL, 0);
    int socket_is_nonblocking = (socket_flags != -1 && (socket_flags & O_NONBLOCK));
    if (socket_flags == -1) {
        sji_log_warn("read: fcntl(F_GETFL) failed for sockfd %d (%s): %s. Assuming blocking for polling logic.",
                     interposer->sockfd, interposer->open_dev_name, strerror(errno));
    }

    size_t bytes_read_total = 0;
    char *buffer_ptr = (char *)buf;
    // We aim to read one full event per call to this interposed read()
    size_t target_read_size = event_size;

    struct timespec start_time_poll; // For timeout if we enter polling loop
    clock_gettime(CLOCK_MONOTONIC, &start_time_poll);
    const long polling_timeout_ns = 2000000000; // 2 seconds

    while (bytes_read_total < target_read_size) {
        ssize_t current_read = recv(interposer->sockfd, buffer_ptr + bytes_read_total, target_read_size - bytes_read_total, 0);

        if (current_read == -1) {
            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                // If our socket is non-blocking and no data is available for the start of an event,
                // return EAGAIN immediately to the application.
                if (socket_is_nonblocking && bytes_read_total == 0) {
                    errno = EAGAIN;
                    return -1;
                }
                // Otherwise (socket is blocking, or socket is non-blocking but we're mid-event),
                // we enter a short polling loop to wait for the rest of the event or timeout.
                struct timespec current_time_poll;
                clock_gettime(CLOCK_MONOTONIC, &current_time_poll);
                long elapsed_ns = (current_time_poll.tv_sec - start_time_poll.tv_sec) * 1000000000L +
                                  (current_time_poll.tv_nsec - start_time_poll.tv_nsec);

                if (elapsed_ns > polling_timeout_ns) {
                    sji_log_warn("read for %s (fd %d): Timeout in polling loop after %ld ns waiting for data (got %zu/%zu bytes).",
                                 interposer->open_dev_name, fd, elapsed_ns, bytes_read_total, target_read_size);
                    errno = ETIMEDOUT; // Or EIO if partial data? ETIMEDOUT seems more appropriate for a read timeout.
                    return -1;
                }
                usleep(1000); // Sleep 1ms and retry recv
                continue;
            }
            // Other recv error
            sji_log_error("read for %s (fd %d): recv error: %s", interposer->open_dev_name, fd, strerror(errno));
            // errno is already set by recv
            return -1;
        } else if (current_read == 0) { // EOF from socket
            sji_log_info("read for %s (fd %d): recv returned 0 (EOF). Peer closed connection.",
                         interposer->open_dev_name, fd);
            if (bytes_read_total > 0 && bytes_read_total < target_read_size) {
                 sji_log_error("read for %s (fd %d): EOF mid-event after %zu bytes.",
                               interposer->open_dev_name, fd, bytes_read_total);
                 errno = EPIPE; // Or EIO; EPIPE suggests broken pipe
                 return -1;
            }
            return 0; // Clean EOF if no partial data, or if bytes_read_total == 0
        }
        // Successfully read some data
        bytes_read_total += current_read;
    }

    // sji_log_info("Successfully read %zu bytes for one event from %s (fd %d).", // Can be noisy
    //                bytes_read_total, interposer->open_dev_name, fd);
    return bytes_read_total;
}


int epoll_ctl(int epfd, int op, int fd, struct epoll_event *event) {
    if (!real_epoll_ctl) { sji_log_error("CRITICAL: real_epoll_ctl not loaded."); errno = EFAULT; return -1; }

    if (op == EPOLL_CTL_ADD || op == EPOLL_CTL_MOD) {
        for (size_t i = 0; i < NUM_INTERPOSERS(); i++) {
            if (fd == interposers[i].sockfd && interposers[i].sockfd != -1) {
                // Applications using epoll with input devices typically expect non-blocking behavior.
                // Ensure our socket is non-blocking when added/modified in an epoll set.
                sji_log_info("epoll_ctl %s for interposed socket fd %d (%s). Ensuring O_NONBLOCK.",
                             (op == EPOLL_CTL_ADD ? "ADD" : "MOD"), fd, interposers[i].open_dev_name);
                if (make_socket_nonblocking(fd) == -1) {
                    sji_log_warn("epoll_ctl: Failed to ensure O_NONBLOCK for socket fd %d (%s).",
                                 fd, interposers[i].open_dev_name);
                    // Proceeding, but epoll behavior might be unexpected if socket remains blocking.
                }
                break;
            }
        }
    }
    return real_epoll_ctl(epfd, op, fd, event);
}

// --- IOCTL Handling ---
// (intercept_js_ioctl and intercept_ev_ioctl are quite long and specific;
//  logging reduction will be applied within them carefully to retain clarity on handled ioctls)

int intercept_js_ioctl(js_interposer_t *interposer, int fd, ioctl_request_t request, void *arg) {
    // Note: Most LOG_TRACE and detailed buffer logs removed. Kept INFO for handled ioctls.
    int len;
    uint8_t *u8_ptr;
    uint16_t *u16_ptr;
    int ret_val = -ENOTTY; // Default for unhandled or invalid

    if (_IOC_TYPE(request) != 'j') {
        sji_log_warn("IOCTL_JS(%s): Received non-joystick ioctl 0x%lx (Type '%c') on JS device. ENOTTY.",
                       interposer->open_dev_name, (unsigned long)request, _IOC_TYPE(request));
        errno = ENOTTY;
        return -1;
    }

    switch (_IOC_NR(request)) {
    case 0x01: // JSIOCGVERSION
        if (!arg) { errno = EINVAL; break; }
        *((uint32_t *)arg) = JS_VERSION;
        sji_log_info("IOCTL_JS(%s): JSIOCGVERSION -> 0x%08x", interposer->open_dev_name, JS_VERSION);
        ret_val = 0; break;
    case 0x11: // JSIOCGAXES
        if (!arg) { errno = EINVAL; break; }
        *((uint8_t *)arg) = interposer->js_config.num_axes;
        sji_log_info("IOCTL_JS(%s): JSIOCGAXES -> %u", interposer->open_dev_name, interposer->js_config.num_axes);
        ret_val = 0; break;
    case 0x12: // JSIOCGBUTTONS
        if (!arg) { errno = EINVAL; break; }
        *((uint8_t *)arg) = interposer->js_config.num_btns;
        sji_log_info("IOCTL_JS(%s): JSIOCGBUTTONS -> %u", interposer->open_dev_name, interposer->js_config.num_btns);
        ret_val = 0; break;
    case 0x13: // JSIOCGNAME(len)
        len = _IOC_SIZE(request);
        if (!arg || len <= 0) { errno = EINVAL; break; }
        strncpy((char *)arg, interposer->js_config.name, len -1 );
        ((char *)arg)[len - 1] = '\0';
        sji_log_info("IOCTL_JS(%s): JSIOCGNAME(%d) -> '%s'", interposer->open_dev_name, len, interposer->js_config.name);
        ret_val = strlen((char*)arg); break;
    case 0x21: // JSIOCSCORR
        if (!arg || _IOC_SIZE(request) != sizeof(js_corr_t)) { errno = EINVAL; break; }
        memcpy(&interposer->corr, arg, sizeof(js_corr_t));
        sji_log_info("IOCTL_JS(%s): JSIOCSCORR (noop, stored)", interposer->open_dev_name);
        ret_val = 0; break;
    case 0x22: // JSIOCGCORR
        if (!arg || _IOC_SIZE(request) != sizeof(js_corr_t)) { errno = EINVAL; break; }
        memcpy(arg, &interposer->corr, sizeof(js_corr_t));
        sji_log_info("IOCTL_JS(%s): JSIOCGCORR", interposer->open_dev_name);
        ret_val = 0; break;
    case 0x31: // JSIOCSAXMAP - Not supported, config comes from socket
        sji_log_warn("IOCTL_JS(%s): JSIOCSAXMAP (not supported, config from socket)", interposer->open_dev_name);
        errno = EPERM; ret_val = -EPERM; break;
    case 0x32: // JSIOCGAXMAP
        if (!arg) { errno = EINVAL; break; }
        u8_ptr = (uint8_t *)arg;
        if (_IOC_SIZE(request) < interposer->js_config.num_axes * sizeof(uint8_t)) { errno = EINVAL; break; }
        memcpy(u8_ptr, interposer->js_config.axes_map, interposer->js_config.num_axes * sizeof(uint8_t));
        sji_log_info("IOCTL_JS(%s): JSIOCGAXMAP (%u axes)", interposer->open_dev_name, interposer->js_config.num_axes);
        ret_val = 0; break;
    case 0x33: // JSIOCSBTNMAP - Not supported
        sji_log_warn("IOCTL_JS(%s): JSIOCSBTNMAP (not supported, config from socket)", interposer->open_dev_name);
        errno = EPERM; ret_val = -EPERM; break;
    case 0x34: // JSIOCGBTNMAP
        if (!arg) { errno = EINVAL; break; }
        u16_ptr = (uint16_t *)arg;
        if (_IOC_SIZE(request) < interposer->js_config.num_btns * sizeof(uint16_t)) { errno = EINVAL; break; }
        memcpy(u16_ptr, interposer->js_config.btn_map, interposer->js_config.num_btns * sizeof(uint16_t));
        sji_log_info("IOCTL_JS(%s): JSIOCGBTNMAP (%u buttons)", interposer->open_dev_name, interposer->js_config.num_btns);
        ret_val = 0; break;
    default:
        sji_log_warn("Unhandled 'joystick' ioctl for %s: request 0x%lx (NR=0x%02x). ENOTTY.",
                     interposer->open_dev_name, (unsigned long)request, _IOC_NR(request));
        errno = ENOTTY; // ret_val is already -ENOTTY
        break;
    }
    if (ret_val == -ENOTTY && errno != ENOTTY) { // If EINVAL was set but ret_val not updated
        errno = EINVAL; // Ensure errno matches failure
    }
    return ret_val;
}

int intercept_ev_ioctl(js_interposer_t *interposer, int fd, ioctl_request_t request, void *arg) {
    // Note: Most LOG_TRACE and detailed buffer logs removed. Kept INFO for handled ioctls.
    struct input_absinfo *absinfo_ptr;
    struct input_id *id_ptr;
    struct ff_effect *effect_s_ptr;
    int effect_id_val;
    int ev_version = 0x010001; // Standard EVDEV version
    int len;
    unsigned int i;
    int ret_val = -ENOTTY;

    char ioctl_type = _IOC_TYPE(request);
    unsigned int ioctl_nr = _IOC_NR(request);
    unsigned int ioctl_size = _IOC_SIZE(request);

    if (ioctl_type == 'E') { // EVDEV specific ioctls
        if (ioctl_nr >= 0x40 && ioctl_nr < (0x40 + ABS_CNT)) { // EVIOCGABS(code)
            uint8_t abs_code = ioctl_nr - 0x40;
            if (!arg) { errno = EINVAL; goto exit_ev_ioctl_early; }
            absinfo_ptr = (struct input_absinfo *)arg;
            memset(absinfo_ptr, 0, sizeof(struct input_absinfo));
            absinfo_ptr->minimum = ABS_AXIS_MIN_DEFAULT;
            absinfo_ptr->maximum = ABS_AXIS_MAX_DEFAULT;
            absinfo_ptr->fuzz = 16; absinfo_ptr->flat = 128;

            if (abs_code == ABS_Z || abs_code == ABS_RZ || abs_code >= ABS_THROTTLE && abs_code <= ABS_WHEEL) { // Triggers/pedals
                absinfo_ptr->minimum = ABS_TRIGGER_MIN_DEFAULT; absinfo_ptr->maximum = ABS_TRIGGER_MAX_DEFAULT;
                absinfo_ptr->fuzz = 0; absinfo_ptr->flat = 0;
            } else if (abs_code >= ABS_HAT0X && abs_code <= ABS_HAT3Y) { // D-Pads
                absinfo_ptr->minimum = ABS_HAT_MIN_DEFAULT; absinfo_ptr->maximum = ABS_HAT_MAX_DEFAULT;
                absinfo_ptr->fuzz = 0; absinfo_ptr->flat = 0;
            }
            sji_log_info("IOCTL_EV(%s): EVIOCGABS(0x%02x)", interposer->open_dev_name, abs_code);
            ret_val = 0; goto exit_ev_ioctl_early;
        }

        if (ioctl_nr == _IOC_NR(EVIOCGNAME(0))) { // EVIOCGNAME(len)
            len = ioctl_size;
            if (!arg || len <= 0) { errno = EINVAL; goto exit_ev_ioctl_early; }
            strncpy((char *)arg, interposer->js_config.name, len - 1);
            ((char *)arg)[len - 1] = '\0';
            sji_log_info("IOCTL_EV(%s): EVIOCGNAME(%d) -> '%s'", interposer->open_dev_name, len, (char *)arg);
            ret_val = strlen((char *)arg); goto exit_ev_ioctl_early;
        }

        if (ioctl_nr == _IOC_NR(EVIOCGPROP(0))) { // EVIOCGPROP(len) - Return 0 properties
            len = ioctl_size;
            if (!arg || len <=0 ) { errno = EINVAL; goto exit_ev_ioctl_early; }
            memset(arg, 0, len);
            sji_log_info("IOCTL_EV(%s): EVIOCGPROP(%d) (0 props)", interposer->open_dev_name, len);
            ret_val = len; goto exit_ev_ioctl_early;
        }

        if (ioctl_nr == _IOC_NR(EVIOCGKEY(0))) { // EVIOCGKEY(len) - Return all keys up
            len = ioctl_size;
            if (!arg || len <=0) { errno = EINVAL; goto exit_ev_ioctl_early; }
            memset(arg, 0, len);
            sji_log_info("IOCTL_EV(%s): EVIOCGKEY(%d) (all keys up)", interposer->open_dev_name, len);
            ret_val = len; goto exit_ev_ioctl_early;
        }

        if (ioctl_nr >= _IOC_NR(EVIOCGBIT(0,0)) && ioctl_nr < _IOC_NR(EVIOCGBIT(EV_MAX,0))) { // EVIOCGBIT(ev_type, len)
            unsigned char ev_type_query = ioctl_nr - _IOC_NR(EVIOCGBIT(0,0));
            len = ioctl_size;
            if (!arg || len <=0) { errno = EINVAL; goto exit_ev_ioctl_early; }
            memset(arg, 0, len);

            if (ev_type_query == 0) { // Query for supported event types (EV_SYN, EV_KEY, EV_ABS, EV_FF)
                if (EV_SYN / 8 < len) ((unsigned char *)arg)[EV_SYN / 8] |= (1 << (EV_SYN % 8));
                if (EV_KEY / 8 < len) ((unsigned char *)arg)[EV_KEY / 8] |= (1 << (EV_KEY % 8));
                if (EV_ABS / 8 < len) ((unsigned char *)arg)[EV_ABS / 8] |= (1 << (EV_ABS % 8));
                if (EV_FF / 8 < len)  ((unsigned char *)arg)[EV_FF / 8]  |= (1 << (EV_FF % 8));
            } else if (ev_type_query == EV_KEY) { // Query for supported keys/buttons
                for (i = 0; i < interposer->js_config.num_btns; ++i) {
                    int key_code = interposer->js_config.btn_map[i];
                    if (key_code >= 0 && key_code < KEY_MAX && (key_code / 8 < len))
                        ((unsigned char *)arg)[key_code / 8] |= (1 << (key_code % 8));
                }
            } else if (ev_type_query == EV_ABS) { // Query for supported absolute axes
                for (i = 0; i < interposer->js_config.num_axes; ++i) {
                    int abs_code = interposer->js_config.axes_map[i];
                     if (abs_code >= 0 && abs_code < ABS_MAX && (abs_code / 8 < len))
                        ((unsigned char *)arg)[abs_code / 8] |= (1 << (abs_code % 8));
                }
            } else if (ev_type_query == EV_FF) { // Query for supported force feedback effects
                 if (FF_RUMBLE / 8 < len) ((unsigned char *)arg)[FF_RUMBLE / 8] |= (1 << (FF_RUMBLE % 8));
            }
            sji_log_info("IOCTL_EV(%s): EVIOCGBIT(type 0x%02x, len %d)", interposer->open_dev_name, ev_type_query, len);
            ret_val = len; goto exit_ev_ioctl_early;
        }

        switch (request) { // Other 'E' type ioctls by full request value
            case EVIOCGVERSION:
                if (!arg) { errno = EINVAL; break; }
                *((int *)arg) = ev_version;
                sji_log_info("IOCTL_EV(%s): EVIOCGVERSION -> 0x%08x", interposer->open_dev_name, ev_version);
                ret_val = 0; break;
            case EVIOCGID:
                if (!arg) { errno = EINVAL; break; }
                id_ptr = (struct input_id *)arg;
                memset(id_ptr, 0, sizeof(struct input_id));
                id_ptr->bustype = BUS_USB; // Common default
                id_ptr->vendor = interposer->js_config.vendor;
                id_ptr->product = interposer->js_config.product;
                id_ptr->version = interposer->js_config.version;
                sji_log_info("IOCTL_EV(%s): EVIOCGID -> bus:0x%x, ven:0x%x, prod:0x%x, ver:0x%x",
                               interposer->open_dev_name, id_ptr->bustype, id_ptr->vendor, id_ptr->product, id_ptr->version);
                ret_val = 0; break;
            case EVIOCGRAB: // Grab/ungrab device (noop)
                sji_log_info("IOCTL_EV(%s): EVIOCGRAB (noop)", interposer->open_dev_name);
                ret_val = 0; break;
            case EVIOCSFF: // Upload force feedback effect (noop, returns dummy id)
                if (!arg) { errno = EINVAL; break; }
                effect_s_ptr = (struct ff_effect *)arg;
                sji_log_info("IOCTL_EV(%s): EVIOCSFF (type: 0x%x, id_in: %d) (noop, returns id)",
                               interposer->open_dev_name, effect_s_ptr->type, effect_s_ptr->id);
                effect_s_ptr->id = (effect_s_ptr->id == -1) ? 1 : effect_s_ptr->id; // Return a valid-looking ID
                ret_val = effect_s_ptr->id; break;
            case EVIOCRMFF: // Remove force feedback effect (noop)
                effect_id_val = (int)(intptr_t)arg; // Argument is the effect ID itself
                sji_log_info("IOCTL_EV(%s): EVIOCRMFF (id: %d) (noop)", interposer->open_dev_name, effect_id_val);
                ret_val = 0; break;
            case EVIOCGEFFECTS: // Get number of simultaneous effects (return 1 for basic rumble)
                 if (!arg) { errno = EINVAL; break; }
                *(int *)arg = 1;
                sji_log_info("IOCTL_EV(%s): EVIOCGEFFECTS -> %d", interposer->open_dev_name, *(int *)arg);
                ret_val = 0; break;
            default:
                sji_log_warn("IOCTL_EV(%s): Unhandled EVDEV ioctl request 0x%lx (Type 'E', NR 0x%02x). ENOTTY.",
                               interposer->open_dev_name, (unsigned long)request, ioctl_nr);
                errno = ENOTTY; // ret_val is already -ENOTTY
                break;
        }
    } else if (ioctl_type == 'j') { // Joystick compatibility ioctls on an EVDEV device
        sji_log_info("IOCTL_EV_COMPAT(%s): Joystick ioctl 0x%lx (Type 'j', NR 0x%02x) on EVDEV device.",
                       interposer->open_dev_name, (unsigned long)request, ioctl_nr);
        // Delegate to js_ioctl handler for compatible subset
        ret_val = intercept_js_ioctl(interposer, fd, request, arg);
    } else {
        sji_log_warn("IOCTL_EV(%s): Received ioctl with unexpected type '%c' (request 0x%lx). ENOTTY.",
                       interposer->open_dev_name, ioctl_type, (unsigned long)request);
        errno = ENOTTY; // ret_val is already -ENOTTY
    }

exit_ev_ioctl_early:
    if (ret_val == -ENOTTY && errno != ENOTTY) { // If EINVAL was set but ret_val not updated
        errno = EINVAL;
    }
    return ret_val;
}

int ioctl(int fd, ioctl_request_t request, ...) {
    if (!real_ioctl) { sji_log_error("CRITICAL: real_ioctl not loaded."); errno = EFAULT; return -1; }

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

    if (interposer == NULL) { // Not an interposed fd
        return real_ioctl(fd, request, arg_ptr);
    }

    // Dispatch to type-specific ioctl handler
    if (interposer->type == DEV_TYPE_JS) {
        return intercept_js_ioctl(interposer, fd, request, arg_ptr);
    } else if (interposer->type == DEV_TYPE_EV) {
        return intercept_ev_ioctl(interposer, fd, request, arg_ptr);
    } else {
        sji_log_error("IOCTL(%s): Interposer has unknown type %d for fd %d.",
                       interposer->open_dev_name, interposer->type, fd);
        errno = EINVAL;
        return -1;
    }
}
