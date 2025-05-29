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

// --- Hardcoded Identity to match fake_udev.c ---
#define FAKE_UDEV_DEVICE_NAME "Microsoft X-Box 360 pad"
#define FAKE_UDEV_VENDOR_ID   0x045e
#define FAKE_UDEV_PRODUCT_ID  0x028e
#define FAKE_UDEV_VERSION_ID  0x0114
#define FAKE_UDEV_BUS_TYPE    BUS_USB // 0x03

// --- Logging ---
static FILE *log_file_fd = NULL;

#define SJI_LOG_LEVEL_DEBUG "[DEBUG]" // Added for finer-grained logging
#define SJI_LOG_LEVEL_INFO "[INFO]"
#define SJI_LOG_LEVEL_WARN "[WARN]"
#define SJI_LOG_LEVEL_ERROR "[ERROR]"

static void init_log_file_if_needed() {
    if (log_file_fd == NULL) {
        log_file_fd = fopen(LOG_FILE, "a");
        if (log_file_fd == NULL) {
            // Use a temporary buffer for the error message to avoid issues if fprintf itself fails on stderr early on
            char err_buf[256];
            snprintf(err_buf, sizeof(err_buf), "[%lu][SJI][ERROR][init_log_file_if_needed:%d] Failed to open log file %s, using stderr. Error: %s\n",
                    (unsigned long)time(NULL), __LINE__, LOG_FILE, strerror(errno));
            log_file_fd = stderr; // Fallback to stderr
            fprintf(log_file_fd, "%s", err_buf); // Print the buffered error
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

#define sji_log_debug(...) interposer_log(SJI_LOG_LEVEL_DEBUG, __func__, __LINE__, __VA_ARGS__)
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
static ssize_t (*real_write)(int fd, const void *buf, size_t count) = NULL; // For completeness

static int load_real_func(void (**target_func_ptr)(void), const char *name) {
    if (*target_func_ptr != NULL) return 0;
    *target_func_ptr = dlsym(RTLD_NEXT, name);
    if (*target_func_ptr == NULL) {
        init_log_file_if_needed(); // Ensure log_file_fd is initialized before using it
        fprintf(log_file_fd, "[%lu][SJI][ERROR][load_real_func:%d] Failed to load real '%s': %s\n",
                (unsigned long)time(NULL), __LINE__, name, dlerror());
        fflush(log_file_fd);
        return -1;
    }
    return 0;
}

// --- Data Structures ---
typedef struct js_corr js_corr_t;

#define CONTROLLER_NAME_MAX_LEN 255
#define INTERPOSER_MAX_BTNS 512
#define INTERPOSER_MAX_AXES 64

typedef struct {
    char name[CONTROLLER_NAME_MAX_LEN];
    uint16_t vendor;
    uint16_t product;
    uint16_t version;
    uint16_t num_btns;
    uint16_t num_axes;
    uint16_t btn_map[INTERPOSER_MAX_BTNS];
    uint8_t axes_map[INTERPOSER_MAX_AXES];
    uint8_t final_alignment_padding[6];
} js_config_t;

typedef struct {
    uint8_t type;
    char open_dev_name[255];
    char socket_path[255];
    int sockfd;
    int open_flags; // Flags app used to open the device
    js_corr_t corr; // For JSIOCSCORR/GCORR
    js_config_t js_config;
} js_interposer_t;

#define DEV_TYPE_JS 0
#define DEV_TYPE_EV 1

#define ABS_AXIS_MIN_DEFAULT -32767
#define ABS_AXIS_MAX_DEFAULT 32767
#define ABS_TRIGGER_MIN_DEFAULT 0
#define ABS_TRIGGER_MAX_DEFAULT 255
#define ABS_HAT_MIN_DEFAULT -1
#define ABS_HAT_MAX_DEFAULT 1

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

__attribute__((constructor)) void init_interposer() {
    init_log_file_if_needed(); // Initialize log first
    if (load_real_func((void *)&real_open, "open") < 0) sji_log_error("CRITICAL: Failed to load real 'open'.");
    if (load_real_func((void *)&real_ioctl, "ioctl") < 0) sji_log_error("CRITICAL: Failed to load real 'ioctl'.");
    if (load_real_func((void *)&real_epoll_ctl, "epoll_ctl") < 0) sji_log_error("CRITICAL: Failed to load real 'epoll_ctl'.");
    if (load_real_func((void *)&real_close, "close") < 0) sji_log_error("CRITICAL: Failed to load real 'close'.");
    if (load_real_func((void *)&real_read, "read") < 0) sji_log_error("CRITICAL: Failed to load real 'read'.");
    if (load_real_func((void *)&real_write, "write") < 0) sji_log_error("CRITICAL: Failed to load real 'write'."); // Load write too
    load_real_func((void *)&real_open64, "open64"); // This one is optional, might not exist
}

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
        sji_log_debug("Socket fd %d was already O_NONBLOCK.", sockfd); // Changed to debug to reduce noise
    }
    return 0;
}

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
        }
    }

    sji_log_info("Attempting to read joystick config (%zd bytes) from sockfd %d.", bytes_to_read, sockfd);
    while (bytes_read_total < bytes_to_read) {
        ssize_t current_read = real_read(sockfd, buffer_ptr + bytes_read_total, bytes_to_read - bytes_read_total);
        if (current_read == -1) {
            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                sji_log_warn("read_socket_config: real_read on sockfd %d returned EAGAIN/EWOULDBLOCK. Retrying.", sockfd);
                usleep(10000); // Sleep briefly and retry for config read
                continue;
            }
            sji_log_error("read_socket_config: real_read failed on sockfd %d: %s", sockfd, strerror(errno));
            goto config_read_error_cleanup;
        } else if (current_read == 0) {
            sji_log_error("read_socket_config: EOF on sockfd %d after %zd bytes (expected %zd). Peer closed connection?", sockfd, bytes_read_total, bytes_to_read);
            goto config_read_error_cleanup;
        }
        bytes_read_total += current_read;
    }

    sji_log_info("Successfully read joystick config from sockfd %d: Name='%s', Vnd=0x%04x, Prd=0x%04x, Ver=0x%04x, Btns=%u, Axes=%u",
                 sockfd, config_dest->name, config_dest->vendor, config_dest->product, config_dest->version,
                 config_dest->num_btns, config_dest->num_axes);

    if (strnlen(config_dest->name, CONTROLLER_NAME_MAX_LEN) == CONTROLLER_NAME_MAX_LEN) {
        config_dest->name[CONTROLLER_NAME_MAX_LEN-1] = '\0';
        sji_log_warn("Config name from server was not null-terminated; forced.");
    }

config_read_error_cleanup: // Renamed label
    if (socket_was_nonblocking && original_socket_flags != -1) {
        sji_log_debug("read_socket_config: Restoring O_NONBLOCK to sockfd %d.", sockfd);
        if (fcntl(sockfd, F_SETFL, original_socket_flags) == -1) {
            sji_log_warn("read_socket_config: Failed to restore O_NONBLOCK to sockfd %d: %s", sockfd, strerror(errno));
        }
    }
    return (bytes_read_total == bytes_to_read) ? 0 : -1;
}

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
            attempt++;
            if (attempt * 10 > SOCKET_CONNECT_TIMEOUT_MS) { // Check before logging every time
                sji_log_error("Timed out connecting to socket %s after %dms.", interposer->socket_path, SOCKET_CONNECT_TIMEOUT_MS);
                goto connect_fail;
            }
            // Log less frequently during retries
            if (attempt == 1 || (attempt % 10 == 0)) { // Log first attempt and every 10th after
                 sji_log_warn("Connection to %s refused/not found, retrying (%dms)...", interposer->socket_path, attempt * 10);
            }
            usleep(10000); // 10ms
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

    unsigned char arch_byte[1] = { (unsigned char)sizeof(long) };
    sji_log_info("Sending architecture specifier (%u bytes) to %s.", arch_byte[0], interposer->socket_path);
    if (real_write(interposer->sockfd, arch_byte, sizeof(arch_byte)) != sizeof(arch_byte)) { // Use real_write
        sji_log_error("Failed to send architecture specifier to %s: %s", interposer->socket_path, strerror(errno));
        goto connect_fail;
    }
    return 0;

connect_fail:
    if (interposer->sockfd != -1) {
        real_close(interposer->sockfd); // Use real_close
        interposer->sockfd = -1;
    }
    return -1;
}

static int common_open_logic(const char *pathname, int flags, js_interposer_t **found_interposer_ptr) {
    *found_interposer_ptr = NULL;
    for (size_t i = 0; i < NUM_INTERPOSERS(); i++) {
        if (strcmp(pathname, interposers[i].open_dev_name) == 0) {
            if (interposers[i].sockfd != -1) {
                sji_log_info("Device %s already open via interposer (fd %d, app_flags_orig=0x%x, new_req_flags=0x%x). Reusing.",
                             pathname, interposers[i].sockfd, interposers[i].open_flags, flags);
                // If app tries to open with different blocking status, we might need to adjust.
                // For now, we assume if it's already open, its blocking status is managed.
                *found_interposer_ptr = &interposers[i];
                return interposers[i].sockfd; // Return existing socket fd as the "app fd"
            }

            interposers[i].open_flags = flags; // Store flags app used
            *found_interposer_ptr = &interposers[i];

            if (connect_interposer_socket(&interposers[i]) == -1) {
                sji_log_error("Failed to establish socket connection for %s.", pathname);
                interposers[i].open_flags = 0; // Reset flags on failure
                errno = EIO; // Indicate I/O error
                return -1;
            }

            // Ensure socket is non-blocking if O_NONBLOCK was requested by app
            if (interposers[i].open_flags & O_NONBLOCK) {
                sji_log_info("Application opened %s with O_NONBLOCK. Setting socket fd %d to non-blocking.",
                             pathname, interposers[i].sockfd);
                if (make_socket_nonblocking(interposers[i].sockfd) == -1) {
                    // Not fatal, but log it. The read/write logic might need to handle this.
                    sji_log_error("Failed to make socket fd %d non-blocking for %s as requested by app. Socket may remain blocking.",
                                  interposers[i].sockfd, pathname);
                }
            }
            sji_log_info("Successfully interposed 'open' for %s (app_flags=0x%x), socket fd: %d. Current socket flags: 0x%x",
                         pathname, interposers[i].open_flags, interposers[i].sockfd, fcntl(interposers[i].sockfd, F_GETFL, 0));
            return interposers[i].sockfd; // Return the socket fd as the "app fd"
        }
    }
    return -2; // Indicates pathname not recognized for interposition
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
    // If result_fd is -1, common_open_logic already set errno.
    // If result_fd >= 0, it's either a real fd or our socket fd.
    return result_fd;
}

#ifdef open64
#undef open64 // Ensure we use our definition
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
        } else {
            sji_log_info("real_open64 not available, falling back to real_open for: %s", pathname);
            result_fd = (flags & O_CREAT) ? real_open(pathname, flags, mode) : real_open(pathname, flags);
        }
    }
    return result_fd;
}

int close(int fd) {
    if (!real_close) { sji_log_error("CRITICAL: real_close not loaded."); errno = EFAULT; return -1; }
    for (size_t i = 0; i < NUM_INTERPOSERS(); i++) {
        if (fd >= 0 && fd == interposers[i].sockfd) { // Check if fd is one of our active socket fds
            sji_log_info("Intercepted 'close' for interposed fd %d (device %s). Closing socket.",
                         fd, interposers[i].open_dev_name);
            int ret = real_close(fd); // Close the actual socket
            if (ret == 0) {
                interposers[i].sockfd = -1; // Mark as closed in our state
                interposers[i].open_flags = 0;
                memset(&(interposers[i].js_config), 0, sizeof(js_config_t));
            } else {
                sji_log_error("real_close on socket fd %d for %s failed: %s.",
                              fd, interposers[i].open_dev_name, strerror(errno));
            }
            return ret;
        }
    }
    return real_close(fd); // Not our fd, pass to real_close
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

    // Determine expected event size based on interposer type
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

    if (count == 0) return 0;
    // Application buffer must be large enough for at least one event
    if (count < event_size) {
        sji_log_warn("read for %s (fd %d): app buffer too small (%zu bytes) for one event (%zu bytes).",
                     interposer->open_dev_name, fd, count, event_size);
        errno = EINVAL; // Or perhaps EFAULT, but EINVAL seems more appropriate for size mismatch
        return -1;
    }

    // Check if the socket is non-blocking (O_NONBLOCK is set on the socket_fd itself)
    // The interposer->open_flags is what the app requested for the device,
    // but epoll_ctl might have forced the socket to be non-blocking.
    int socket_actual_flags = fcntl(interposer->sockfd, F_GETFL, 0);
    int socket_is_actually_nonblocking = (socket_actual_flags != -1 && (socket_actual_flags & O_NONBLOCK));

    if (socket_actual_flags == -1) {
        sji_log_warn("read: fcntl(F_GETFL) failed for sockfd %d (%s): %s. Proceeding cautiously.",
                     interposer->sockfd, interposer->open_dev_name, strerror(errno));
    }
    
    // For non-blocking, try to read one event.
    // For blocking, the recv call will block.
    ssize_t bytes_read = recv(interposer->sockfd, buf, event_size, 0); // Read at most one event

    if (bytes_read == -1) {
        if (errno == EAGAIN || errno == EWOULDBLOCK) {
            // This is expected for non-blocking if no data
            if (socket_is_actually_nonblocking) {
                 // sji_log_debug("read: sockfd %d (%s) non-blocking, no data (EAGAIN/EWOULDBLOCK)", interposer->sockfd, interposer->open_dev_name);
            } else {
                 sji_log_warn("read: sockfd %d (%s) blocking, but got EAGAIN/EWOULDBLOCK? This is unexpected.", interposer->sockfd, interposer->open_dev_name);
            }
        } else {
            sji_log_error("SOCKET_READ_ERR: read from socket_fd %d (%s) returned -1, errno: %d (%s)",
                          interposer->sockfd, interposer->open_dev_name, errno, strerror(errno));
        }
        // errno is already set by recv
        return -1;
    } else if (bytes_read == 0) {
        sji_log_info("SOCKET_READ_EOF: read from socket_fd %d (%s) returned 0 (EOF - server closed connection?)",
                     interposer->sockfd, interposer->open_dev_name);
        return 0; // EOF
    } else {
        // sji_log_debug("SOCKET_READ_OK: read %zd bytes from socket_fd %d (%s)",
        //              bytes_read, interposer->sockfd, interposer->open_dev_name);
        if (bytes_read < event_size && bytes_read > 0) {
            sji_log_warn("SOCKET_READ_PARTIAL: read %zd bytes from socket_fd %d (%s), but expected %zu. This might be an issue.",
                         bytes_read, interposer->sockfd, interposer->open_dev_name, event_size);
            // Application might not handle partial events well. Consider if this should be an error.
        }
    }
    return bytes_read;
}


int epoll_ctl(int epfd, int op, int fd, struct epoll_event *event) {
    if (!real_epoll_ctl) { sji_log_error("CRITICAL: real_epoll_ctl not loaded."); errno = EFAULT; return -1; }
    // If adding/modifying an interposed FD, ensure the underlying socket is non-blocking
    // because epoll is typically used with non-blocking FDs.
    if (op == EPOLL_CTL_ADD || op == EPOLL_CTL_MOD) {
        for (size_t i = 0; i < NUM_INTERPOSERS(); i++) {
            if (fd == interposers[i].sockfd && interposers[i].sockfd != -1) {
                sji_log_info("epoll_ctl %s for interposed socket fd %d (%s). Ensuring O_NONBLOCK.",
                             (op == EPOLL_CTL_ADD ? "ADD" : "MOD"), fd, interposers[i].open_dev_name);
                if (make_socket_nonblocking(fd) == -1) {
                    // This is a warning because epoll might still work, but behavior could be unexpected.
                    sji_log_warn("epoll_ctl: Failed to ensure O_NONBLOCK for socket fd %d (%s).",
                                 fd, interposers[i].open_dev_name);
                }
                break; // Found our interposed fd
            }
        }
    }
    return real_epoll_ctl(epfd, op, fd, event);
}

// --- IOCTL Handling ---

int intercept_js_ioctl(js_interposer_t *interposer, int fd, ioctl_request_t request, void *arg) {
    int len;
    uint8_t *u8_ptr;
    uint16_t *u16_ptr;
    int ret_val = 0;
    errno = 0; // Clear errno before processing

    if (_IOC_TYPE(request) != 'j') {
        sji_log_warn("IOCTL_JS(%s): Received non-joystick ioctl 0x%lx (Type '%c') on JS device. ENOTTY.",
                       interposer->open_dev_name, (unsigned long)request, _IOC_TYPE(request));
        errno = ENOTTY;
        ret_val = -1;
        goto exit_js_ioctl_log; // Use a common exit point for logging
    }

    switch (_IOC_NR(request)) {
    case 0x01: // JSIOCGVERSION
        if (!arg) { errno = EINVAL; ret_val = -1; break; }
        *((uint32_t *)arg) = JS_VERSION;
        sji_log_info("IOCTL_JS(%s): JSIOCGVERSION -> 0x%08x", interposer->open_dev_name, JS_VERSION);
        break;
    case 0x11: // JSIOCGAXES
        if (!arg) { errno = EINVAL; ret_val = -1; break; }
        *((uint8_t *)arg) = interposer->js_config.num_axes;
        sji_log_info("IOCTL_JS(%s): JSIOCGAXES -> %u (from server config)", interposer->open_dev_name, interposer->js_config.num_axes);
        break;
    case 0x12: // JSIOCGBUTTONS
        if (!arg) { errno = EINVAL; ret_val = -1; break; }
        *((uint8_t *)arg) = interposer->js_config.num_btns;
        sji_log_info("IOCTL_JS(%s): JSIOCGBUTTONS -> %u (from server config)", interposer->open_dev_name, interposer->js_config.num_btns);
        break;
    case 0x13: // JSIOCGNAME(len)
        len = _IOC_SIZE(request);
        if (!arg || len <= 0) { errno = EINVAL; ret_val = -1; break; }
        strncpy((char *)arg, FAKE_UDEV_DEVICE_NAME, len -1 ); // Use hardcoded name
        ((char *)arg)[len - 1] = '\0'; // Ensure null termination
        sji_log_info("IOCTL_JS(%s): JSIOCGNAME(%d) -> '%s' (Hardcoded for fake_udev sync)",
                     interposer->open_dev_name, len, FAKE_UDEV_DEVICE_NAME);
        ret_val = strlen((char*)arg); // Return length of string copied (excluding null)
        break;
    case 0x21: // JSIOCSCORR
        if (!arg || _IOC_SIZE(request) != sizeof(js_corr_t)) { errno = EINVAL; ret_val = -1; break; }
        memcpy(&interposer->corr, arg, sizeof(js_corr_t));
        sji_log_info("IOCTL_JS(%s): JSIOCSCORR (noop, stored)", interposer->open_dev_name);
        break;
    case 0x22: // JSIOCGCORR
        if (!arg || _IOC_SIZE(request) != sizeof(js_corr_t)) { errno = EINVAL; ret_val = -1; break; }
        memcpy(arg, &interposer->corr, sizeof(js_corr_t));
        sji_log_info("IOCTL_JS(%s): JSIOCGCORR", interposer->open_dev_name);
        break;
    case 0x31: // JSIOCSAXMAP - Not supported, config comes from server
        sji_log_warn("IOCTL_JS(%s): JSIOCSAXMAP (not supported, config from socket)", interposer->open_dev_name);
        errno = EPERM; ret_val = -1; break;
    case 0x32: // JSIOCGAXMAP
        if (!arg) { errno = EINVAL; ret_val = -1; break; }
        u8_ptr = (uint8_t *)arg;
        if (_IOC_SIZE(request) < interposer->js_config.num_axes * sizeof(uint8_t) ||
            interposer->js_config.num_axes > INTERPOSER_MAX_AXES) {
            sji_log_error("IOCTL_JS(%s): JSIOCGAXMAP invalid size/count. ReqSize: %u, CfgAxes: %u",
                          interposer->open_dev_name, _IOC_SIZE(request), interposer->js_config.num_axes);
            errno = EINVAL; ret_val = -1; break;
        }
        memcpy(u8_ptr, interposer->js_config.axes_map, interposer->js_config.num_axes * sizeof(uint8_t));
        sji_log_info("IOCTL_JS(%s): JSIOCGAXMAP (%u axes from server config)", interposer->open_dev_name, interposer->js_config.num_axes);
        break;
    case 0x33: // JSIOCSBTNMAP - Not supported
        sji_log_warn("IOCTL_JS(%s): JSIOCSBTNMAP (not supported, config from socket)", interposer->open_dev_name);
        errno = EPERM; ret_val = -1; break;
    case 0x34: // JSIOCGBTNMAP
        if (!arg) { errno = EINVAL; ret_val = -1; break; }
        u16_ptr = (uint16_t *)arg;
        if (_IOC_SIZE(request) < interposer->js_config.num_btns * sizeof(uint16_t) ||
            interposer->js_config.num_btns > INTERPOSER_MAX_BTNS) {
            sji_log_error("IOCTL_JS(%s): JSIOCGBTNMAP invalid size/count. ReqSize: %u, CfgBtns: %u",
                          interposer->open_dev_name, _IOC_SIZE(request), interposer->js_config.num_btns);
            errno = EINVAL; ret_val = -1; break;
        }
        memcpy(u16_ptr, interposer->js_config.btn_map, interposer->js_config.num_btns * sizeof(uint16_t));
        sji_log_info("IOCTL_JS(%s): JSIOCGBTNMAP (%u buttons from server config)", interposer->open_dev_name, interposer->js_config.num_btns);
        break;
    default:
        sji_log_warn("Unhandled 'joystick' ioctl for %s: request 0x%lx (NR=0x%02x). ENOTTY.",
                     interposer->open_dev_name, (unsigned long)request, _IOC_NR(request));
        errno = ENOTTY;
        ret_val = -1;
        break;
    }

exit_js_ioctl_log: // Common exit point for consistent logging
    // Ensure errno is set if ret_val is -1, and clear if ret_val is 0 or positive
    if (ret_val < 0 && errno == 0) {
        errno = ENOTTY; // Default error if none was set
    } else if (ret_val >= 0) {
        errno = 0; // Success means no error
    }
    sji_log_info("IOCTL_JS_RETURN(%s): req=0x%lx, ret_val=%d, errno=%d (%s)",
                 interposer->open_dev_name, (unsigned long)request, ret_val, errno, (errno != 0 ? strerror(errno) : "Success"));
    return ret_val;
}

int intercept_ev_ioctl(js_interposer_t *interposer, int fd, ioctl_request_t request, void *arg) {
    struct input_absinfo *absinfo_ptr;
    struct input_id *id_ptr;
    struct ff_effect *effect_s_ptr;
    int effect_id_val;
    int ev_version = 0x010001; // EV_VERSION
    int len;
    unsigned int i;
    int ret_val = 0;
    errno = 0; // Clear errno

    char ioctl_type = _IOC_TYPE(request);
    unsigned int ioctl_nr = _IOC_NR(request);
    unsigned int ioctl_size = _IOC_SIZE(request);

    if (ioctl_type == 'E') { // Standard EVDEV ioctls
        // Handle EVIOCGABS(abs_code) - Get abs value info
        if (ioctl_nr >= _IOC_NR(EVIOCGABS(0)) && ioctl_nr < (_IOC_NR(EVIOCGABS(0)) + ABS_CNT)) {
            uint8_t abs_code = ioctl_nr - _IOC_NR(EVIOCGABS(0));
            if (!arg || ioctl_size < sizeof(struct input_absinfo)) { errno = EINVAL; ret_val = -1; goto exit_ev_ioctl_log; }
            absinfo_ptr = (struct input_absinfo *)arg;
            memset(absinfo_ptr, 0, sizeof(struct input_absinfo));

            absinfo_ptr->value = 0;
            absinfo_ptr->minimum = ABS_AXIS_MIN_DEFAULT;
            absinfo_ptr->maximum = ABS_AXIS_MAX_DEFAULT;
            absinfo_ptr->fuzz = 16;
            absinfo_ptr->flat = 128;
            absinfo_ptr->resolution = 0;

            if (abs_code == ABS_Z || abs_code == ABS_RZ) { // Triggers
                absinfo_ptr->minimum = ABS_TRIGGER_MIN_DEFAULT;
                absinfo_ptr->maximum = ABS_TRIGGER_MAX_DEFAULT;
                absinfo_ptr->fuzz = 0;
                absinfo_ptr->flat = 0;
            } else if (abs_code == ABS_HAT0X || abs_code == ABS_HAT0Y) { // D-pad
                absinfo_ptr->minimum = ABS_HAT_MIN_DEFAULT;
                absinfo_ptr->maximum = ABS_HAT_MAX_DEFAULT;
                absinfo_ptr->fuzz = 0;
                absinfo_ptr->flat = 0;
            } else if (abs_code != ABS_X && abs_code != ABS_Y && abs_code != ABS_RX && abs_code != ABS_RY) {
                 sji_log_warn("IOCTL_EV(%s): EVIOCGABS(0x%02x) - axis not standard X360, using general defaults.",
                             interposer->open_dev_name, abs_code);
            }
            sji_log_info("IOCTL_EV(%s): EVIOCGABS(0x%02x)", interposer->open_dev_name, abs_code);
            goto exit_ev_ioctl_log;
        }

        // Handle EVIOCGNAME(len)
        if (ioctl_nr == _IOC_NR(EVIOCGNAME(0))) {
            len = ioctl_size;
            if (!arg || len <= 0) { errno = EINVAL; ret_val = -1; goto exit_ev_ioctl_log; }
            strncpy((char *)arg, FAKE_UDEV_DEVICE_NAME, len - 1);
            ((char *)arg)[len - 1] = '\0';
            sji_log_info("IOCTL_EV(%s): EVIOCGNAME(%d) -> '%s' (Hardcoded for fake_udev sync)",
                         interposer->open_dev_name, len, FAKE_UDEV_DEVICE_NAME);
            ret_val = strlen((char *)arg);
            goto exit_ev_ioctl_log;
        }

        // Handle EVIOCGPROP(len)
        if (ioctl_nr == _IOC_NR(EVIOCGPROP(0))) {
            len = ioctl_size;
            if (!arg || len <=0 ) { errno = EINVAL; ret_val = -1; goto exit_ev_ioctl_log; }
            memset(arg, 0, len); // No specific input properties
            sji_log_info("IOCTL_EV(%s): EVIOCGPROP(%d) (0 props)", interposer->open_dev_name, len);
            ret_val = 0; // Number of bytes for properties (0 if no properties)
            goto exit_ev_ioctl_log;
        }

        // Handle EVIOCGKEY(len) - Get current key/button state (all up)
        if (ioctl_nr == _IOC_NR(EVIOCGKEY(0))) {
            len = ioctl_size;
            if (!arg || len <=0) { errno = EINVAL; ret_val = -1; goto exit_ev_ioctl_log; }
            memset(arg, 0, len);
            sji_log_info("IOCTL_EV(%s): EVIOCGKEY(%d) (all keys up)", interposer->open_dev_name, len);
            ret_val = len;
            goto exit_ev_ioctl_log;
        }

        // Handle EVIOCGBIT(ev_type, len) - Get event type or specific type bits
        if (ioctl_nr >= _IOC_NR(EVIOCGBIT(0,0)) && ioctl_nr < _IOC_NR(EVIOCGBIT(EV_MAX,0))) {
            unsigned char ev_type_query = ioctl_nr - _IOC_NR(EVIOCGBIT(0,0));
            len = ioctl_size;
            if (!arg || len <=0) { errno = EINVAL; ret_val = -1; goto exit_ev_ioctl_log; }
            memset(arg, 0, len);

            if (ev_type_query == 0) { // Query for supported event types
                if (EV_SYN / 8 < len) ((unsigned char *)arg)[EV_SYN / 8] |= (1 << (EV_SYN % 8));
                if (EV_KEY / 8 < len) ((unsigned char *)arg)[EV_KEY / 8] |= (1 << (EV_KEY % 8));
                if (EV_ABS / 8 < len) ((unsigned char *)arg)[EV_ABS / 8] |= (1 << (EV_ABS % 8));
                if (EV_FF  / 8 < len) ((unsigned char *)arg)[EV_FF  / 8] |= (1 << (EV_FF  % 8));
                sji_log_info("IOCTL_EV(%s): EVIOCGBIT(type 0x00 - General, len %d) -> EV_SYN, EV_KEY, EV_ABS, EV_FF",
                             interposer->open_dev_name, len);
            } else if (ev_type_query == EV_KEY) {
                for (i = 0; i < interposer->js_config.num_btns; ++i) {
                    int key_code = interposer->js_config.btn_map[i];
                    if (key_code >= 0 && key_code < KEY_MAX && (key_code / 8 < len)) {
                        ((unsigned char *)arg)[key_code / 8] |= (1 << (key_code % 8));
                    }
                }
                sji_log_info("IOCTL_EV(%s): EVIOCGBIT(type 0x%02x - EV_KEY, len %d, num_btns_cfg %u from server)",
                             interposer->open_dev_name, ev_type_query, len, interposer->js_config.num_btns);
            } else if (ev_type_query == EV_ABS) {
                for (i = 0; i < interposer->js_config.num_axes; ++i) {
                    int abs_code = interposer->js_config.axes_map[i];
                     if (abs_code >= 0 && abs_code < ABS_MAX && (abs_code / 8 < len)) {
                        ((unsigned char *)arg)[abs_code / 8] |= (1 << (abs_code % 8));
                     }
                }
                sji_log_info("IOCTL_EV(%s): EVIOCGBIT(type 0x%02x - EV_ABS, len %d, num_axes_cfg %u from server)",
                             interposer->open_dev_name, ev_type_query, len, interposer->js_config.num_axes);
            } else if (ev_type_query == EV_FF) {
                if (FF_RUMBLE / 8 < len) ((unsigned char *)arg)[FF_RUMBLE / 8] |= (1 << (FF_RUMBLE % 8));
                sji_log_info("IOCTL_EV(%s): EVIOCGBIT(type 0x%02x - EV_FF, len %d) -> FF_RUMBLE",
                             interposer->open_dev_name, ev_type_query, len);
            } else {
                sji_log_info("IOCTL_EV(%s): EVIOCGBIT(type 0x%02x - Other, len %d) -> No bits set",
                             interposer->open_dev_name, ev_type_query, len);
            }
            ret_val = len;
            goto exit_ev_ioctl_log;
        }

        // Handle specific EVDEV ioctls by request number
        switch (request) {
            case EVIOCGVERSION:
                if (!arg || ioctl_size < sizeof(int)) { errno = EINVAL; ret_val = -1; break; }
                *((int *)arg) = ev_version;
                sji_log_info("IOCTL_EV(%s): EVIOCGVERSION -> 0x%08x", interposer->open_dev_name, ev_version);
                break;
            case EVIOCGID:
                if (!arg || ioctl_size < sizeof(struct input_id)) { errno = EINVAL; ret_val = -1; break; }
                id_ptr = (struct input_id *)arg;
                memset(id_ptr, 0, sizeof(struct input_id));
                id_ptr->bustype = FAKE_UDEV_BUS_TYPE;
                id_ptr->vendor  = FAKE_UDEV_VENDOR_ID;
                id_ptr->product = FAKE_UDEV_PRODUCT_ID;
                id_ptr->version = FAKE_UDEV_VERSION_ID;
                sji_log_info("IOCTL_EV(%s): EVIOCGID -> bus:0x%04x, ven:0x%04x, prod:0x%04x, ver:0x%04x (Hardcoded for fake_udev sync)",
                               interposer->open_dev_name, id_ptr->bustype, id_ptr->vendor, id_ptr->product, id_ptr->version);
                break;
            case EVIOCGRAB:
                sji_log_info("IOCTL_EV(%s): EVIOCGRAB (noop, success)", interposer->open_dev_name);
                break;
            case EVIOCSFF:
                if (!arg || ioctl_size < sizeof(struct ff_effect)) { errno = EINVAL; ret_val = -1; break; }
                effect_s_ptr = (struct ff_effect *)arg;
                sji_log_info("IOCTL_EV(%s): EVIOCSFF (type: 0x%x, id_in: %d) (noop, returns id)",
                               interposer->open_dev_name, effect_s_ptr->type, effect_s_ptr->id);
                effect_s_ptr->id = (effect_s_ptr->id == -1) ? 1 : effect_s_ptr->id;
                ret_val = effect_s_ptr->id;
                break;
            case EVIOCRMFF:
                effect_id_val = (int)(intptr_t)arg;
                sji_log_info("IOCTL_EV(%s): EVIOCRMFF (id: %d) (noop, success)", interposer->open_dev_name, effect_id_val);
                break;
            case EVIOCGEFFECTS:
                if (!arg || ioctl_size < sizeof(int)) { errno = EINVAL; ret_val = -1; break; }
                *(int *)arg = 1; // Report 1 effect slot
                sji_log_info("IOCTL_EV(%s): EVIOCGEFFECTS -> %d", interposer->open_dev_name, *(int *)arg);
                break;
            default: // Unhandled EVDEV ioctl
                sji_log_warn("IOCTL_EV(%s): Unhandled EVDEV ioctl request 0x%lx (Type 'E', NR 0x%02x). ENOTTY.",
                               interposer->open_dev_name, (unsigned long)request, ioctl_nr);
                errno = ENOTTY;
                ret_val = -1;
                break;
        }
    } else if (ioctl_type == 'j') { // Joystick compatibility ioctls on an EVDEV device
        sji_log_info("IOCTL_EV_COMPAT(%s): Joystick ioctl 0x%lx (Type 'j', NR 0x%02x) on EVDEV device. Delegating.",
                       interposer->open_dev_name, (unsigned long)request, ioctl_nr);
        return intercept_js_ioctl(interposer, fd, request, arg); // Delegate
    } else { // Unknown ioctl type
        sji_log_warn("IOCTL_EV(%s): Received ioctl with unexpected type '%c' (request 0x%lx). ENOTTY.",
                       interposer->open_dev_name, ioctl_type, (unsigned long)request);
        errno = ENOTTY;
        ret_val = -1;
    }

exit_ev_ioctl_log: // Common exit point for consistent logging
    if (ret_val < 0 && errno == 0) {
        errno = ENOTTY;
    } else if (ret_val >= 0) {
        errno = 0;
    }
    sji_log_info("IOCTL_EV_RETURN(%s): req=0x%lx, ret_val=%d, errno=%d (%s)",
                 interposer->open_dev_name, (unsigned long)request, ret_val, errno, (errno != 0 ? strerror(errno) : "Success"));
    return ret_val;
}

int ioctl(int fd, ioctl_request_t request, ...) {
    if (!real_ioctl) { sji_log_error("CRITICAL: real_ioctl not loaded."); errno = EFAULT; return -1; }
    va_list args_list;
    va_start(args_list, request);
    void *arg_ptr = va_arg(args_list, void *); // Get the third argument
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

    // Route to specific ioctl handler based on interposer type
    if (interposer->type == DEV_TYPE_JS) {
        return intercept_js_ioctl(interposer, fd, request, arg_ptr);
    } else if (interposer->type == DEV_TYPE_EV) {
        return intercept_ev_ioctl(interposer, fd, request, arg_ptr);
    } else {
        sji_log_error("IOCTL(%s): Interposer has unknown type %d for fd %d.",
                       interposer->open_dev_name, interposer->type, fd);
        errno = EINVAL; // Should not happen
        return -1;
    }
}
