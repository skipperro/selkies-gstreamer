/*
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
*/

/*
    This is an LD_PRELOAD interposer library to connect /dev/input/jsX devices to unix domain sockets.
    The unix domain sockets are used to send/receive joystick cofiguration and events.

    The open() SYSCALL is interposed to initiate the socket connection
    and recieve the joystick configuration like name, button and axes mappings.

    The ioctl() SYSCALL is interposed to fake the behavior of a input event character device.
    These ioctl requests were mostly reverse engineered from the joystick.h source and using the jstest command to test.

    Note that some applications list the /dev/input/ directory to discover JS devices, to solve for this, create empty files at the following paths:
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
#include <linux/input.h> // For EV_SYN, EV_KEY, EV_ABS, input_id, input_absinfo etc.
#include <linux/input-event-codes.h> // For BTN_*, ABS_*, KEY_*

// Conditional type for ioctl request parameter
#ifdef __GLIBC__
typedef unsigned long ioctl_request_t;
#else // For musl and other POSIX-compliant libc
typedef int ioctl_request_t;
#endif

#define LOG_FILE "/tmp/selkies_js.log"

// Timeout to wait for unix domain socket to exist and connect.
#define SOCKET_CONNECT_TIMEOUT_MS 250

// Raw joystick interposer constants.
#define JS0_DEVICE_PATH "/dev/input/js0"
#define JS0_SOCKET_PATH "/tmp/selkies_js0.sock"
#define JS1_DEVICE_PATH "/dev/input/js1"
#define JS1_SOCKET_PATH "/tmp/selkies_js1.sock"
#define JS2_DEVICE_PATH "/dev/input/js2"
#define JS2_SOCKET_PATH "/tmp/selkies_js2.sock"
#define JS3_DEVICE_PATH "/dev/input/js3"
#define JS3_SOCKET_PATH "/tmp/selkies_js3.sock"
#define NUM_JS_INTERPOSERS 4

// Event type joystick interposer constant.
#define EV0_DEVICE_PATH "/dev/input/event1000"
#define EV0_SOCKET_PATH "/tmp/selkies_event1000.sock"
#define EV1_DEVICE_PATH "/dev/input/event1001"
#define EV1_SOCKET_PATH "/tmp/selkies_event1001.sock"
#define EV2_DEVICE_PATH "/dev/input/event1002"
#define EV2_SOCKET_PATH "/tmp/selkies_event1002.sock"
#define EV3_DEVICE_PATH "/dev/input/event1003"
#define EV3_SOCKET_PATH "/tmp/selkies_event1003.sock"
#define NUM_EV_INTERPOSERS 4

// Macros for working with interposer count and indexing.
#define NUM_INTERPOSERS() (NUM_JS_INTERPOSERS + NUM_EV_INTERPOSERS)

static FILE *log_file_fd = NULL;
void init_log_file()
{
    if (log_file_fd != NULL)
        return;
    log_file_fd = fopen(LOG_FILE, "a");
    if (log_file_fd == NULL) {
        // Fallback to stderr if log file cannot be opened
        log_file_fd = stderr;
    }
}

// Log messages from the interposer go to stderr
#define LOG_INFO "[INFO]"
#define LOG_WARN "[WARN]"
#define LOG_ERROR "[ERROR]"
static void interposer_log(const char *level, const char *format, ...)
{
    init_log_file();
    va_list argp;
    fprintf(log_file_fd, "[%lu][Selkies Joystick Interposer]%s ", (unsigned long)time(NULL), level);
    va_start(argp, format);
    vfprintf(log_file_fd, format, argp);
    va_end(argp);
    fprintf(log_file_fd, "\n");
    fflush(log_file_fd);
}

// Function that takes the address of a function pointer and uses dlsym to load the system function into it
static int load_real_func(void (**target_func_ptr)(void), const char *name)
{
    if (*target_func_ptr != NULL)
        return 0;
    *target_func_ptr = dlsym(RTLD_NEXT, name);
    if (*target_func_ptr == NULL) 
    {
        return -1;
    }
    return 0;
}

// Function pointers to original calls
static int (*real_open)(const char *pathname, int flags, ...) = NULL;
static int (*real_open64)(const char *pathname, int flags, ...) = NULL;
static int (*real_ioctl)(int fd, ioctl_request_t request, ...) = NULL;
static int (*real_epoll_ctl)(int epfd, int op, int fd, struct epoll_event *event) = NULL;
static int (*real_close)(int fd) = NULL;
static ssize_t (*real_read)(int fd, void *buf, size_t count) = NULL;

__attribute__((constructor)) void init_interposer()
{
    // Essential functions - log as error if not found
    if (load_real_func((void *)&real_open, "open") < 0) {
        interposer_log(LOG_ERROR, "CRITICAL: Failed to load real 'open'. Interposer may not function.");
    }
    if (load_real_func((void *)&real_ioctl, "ioctl") < 0) {
        interposer_log(LOG_ERROR, "CRITICAL: Failed to load real 'ioctl'. Interposer may not function.");
    }
     if (load_real_func((void *)&real_epoll_ctl, "epoll_ctl") < 0) {
        interposer_log(LOG_ERROR, "CRITICAL: Failed to load real 'epoll_ctl'. Interposer may not function.");
    }
    if (load_real_func((void *)&real_close, "close") < 0) {
        interposer_log(LOG_ERROR, "CRITICAL: Failed to load real 'close'. Interposer may not function.");
    }
    if (load_real_func((void *)&real_read, "read") < 0) {
        interposer_log(LOG_ERROR, "CRITICAL: Failed to load real 'read'. Event reading will likely fail.");
    }

    // open64 is optional; real_open64 will remain NULL if not found.
    // The warning from load_real_func is sufficient.
    load_real_func((void *)&real_open64, "open64");
}

typedef struct js_corr js_corr_t;

#define CONTROLLER_NAME_MAX_LEN 255
#define INTERPOSER_MAX_BTNS 512
#define INTERPOSER_MAX_AXES 64

typedef struct
{
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

typedef struct
{
    uint8_t type; 
    char open_dev_name[255];
    char socket_path[255];
    int sockfd;
    js_corr_t corr; 
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
    { DEV_TYPE_JS, JS0_DEVICE_PATH, JS0_SOCKET_PATH, -1, {0}, {0} },
    { DEV_TYPE_JS, JS1_DEVICE_PATH, JS1_SOCKET_PATH, -1, {0}, {0} },
    { DEV_TYPE_JS, JS2_DEVICE_PATH, JS2_SOCKET_PATH, -1, {0}, {0} },
    { DEV_TYPE_JS, JS3_DEVICE_PATH, JS3_SOCKET_PATH, -1, {0}, {0} },
    { DEV_TYPE_EV, EV0_DEVICE_PATH, EV0_SOCKET_PATH, -1, {0}, {0} },
    { DEV_TYPE_EV, EV1_DEVICE_PATH, EV1_SOCKET_PATH, -1, {0}, {0} },
    { DEV_TYPE_EV, EV2_DEVICE_PATH, EV2_SOCKET_PATH, -1, {0}, {0} },
    { DEV_TYPE_EV, EV3_DEVICE_PATH, EV3_SOCKET_PATH, -1, {0}, {0} },
};

int make_nonblocking(int sockfd)
{
    int flags = fcntl(sockfd, F_GETFL, 0);
    if (flags == -1)
    {
        interposer_log(LOG_ERROR, "fcntl(F_GETFL) failed for fd %d: %s", sockfd, strerror(errno));
        return -1;
    }
    if (fcntl(sockfd, F_SETFL, flags | O_NONBLOCK) == -1)
    {
        interposer_log(LOG_ERROR, "fcntl(F_SETFL, O_NONBLOCK) failed for fd %d: %s", sockfd, strerror(errno));
        return -1;
    }
    return 0;
}

int read_config(int fd, js_config_t *config_dest)
{
    ssize_t bytes_to_read = sizeof(js_config_t);
    ssize_t bytes_read_total = 0;
    char *buffer_ptr = (char *)config_dest;

    interposer_log(LOG_INFO, "Attempting to read %zd bytes for js_config_t from fd %d.", bytes_to_read, fd);

    while (bytes_read_total < bytes_to_read) {
        ssize_t current_read = real_read(fd, buffer_ptr + bytes_read_total, bytes_to_read - bytes_read_total);
        if (current_read == -1) {
            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                interposer_log(LOG_WARN, "read_config: read() returned EAGAIN/EWOULDBLOCK on fd %d. Retrying.", fd);
                usleep(10000); 
                continue;
            }
            interposer_log(LOG_ERROR, "read_config: Failed to read config from fd %d. read() error: %s", fd, strerror(errno));
            return -1;
        } else if (current_read == 0) {
            interposer_log(LOG_ERROR, "read_config: Failed to read full config from fd %d. Reached EOF after %zd bytes (expected %zd).", fd, bytes_read_total, bytes_to_read);
            return -1; 
        }
        bytes_read_total += current_read;
    }
    
    interposer_log(LOG_INFO, "Successfully read %zd bytes for js_config_t from fd %d.", bytes_read_total, fd);
    interposer_log(LOG_INFO, "  Config Name: '%s'", config_dest->name); 
    interposer_log(LOG_INFO, "  Vendor: 0x%04x, Product: 0x%04x, Version: 0x%04x", config_dest->vendor, config_dest->product, config_dest->version);
    interposer_log(LOG_INFO, "  Num Buttons (from config): %u", config_dest->num_btns);
    interposer_log(LOG_INFO, "  Num Axes (from config): %u", config_dest->num_axes);
    if (config_dest->num_btns > 0 && INTERPOSER_MAX_BTNS > 0) {
        interposer_log(LOG_INFO, "  Btn Map [0]: 0x%04x", config_dest->btn_map[0]);
    }
    if (config_dest->num_axes > 0 && INTERPOSER_MAX_AXES > 0) {
        interposer_log(LOG_INFO, "  Axes Map [0]: 0x%02x", config_dest->axes_map[0]);
    }
    if (strnlen(config_dest->name, CONTROLLER_NAME_MAX_LEN) == CONTROLLER_NAME_MAX_LEN) {
        interposer_log(LOG_WARN, "Config name might not be null-terminated within CONTROLLER_NAME_MAX_LEN.");
    }
    return 0;
}

int interposer_open_socket(js_interposer_t *interposer)
{
    interposer_log(LOG_INFO, "interposer_open_socket for device: %s, socket_path: %s", interposer->open_dev_name, interposer->socket_path);
    interposer->sockfd = socket(AF_UNIX, SOCK_STREAM, 0);
    if (interposer->sockfd == -1)
    {
        interposer_log(LOG_ERROR, "Failed to create socket fd for %s: %s", interposer->socket_path, strerror(errno));
        return -1;
    }

    struct sockaddr_un addr;
    memset(&addr, 0, sizeof(struct sockaddr_un));
    addr.sun_family = AF_UNIX;
    strncpy(addr.sun_path, interposer->socket_path, sizeof(addr.sun_path) - 1);

    int attempt = 0;
    while (attempt++ < SOCKET_CONNECT_TIMEOUT_MS)
    {
        if (connect(interposer->sockfd, (struct sockaddr *)&addr, sizeof(struct sockaddr_un)) == -1)
        {
            if (errno == ENOENT || errno == ECONNREFUSED) { 
                usleep(1000); 
                continue;
            }
            interposer_log(LOG_ERROR, "Failed to connect to socket %s: %s (attempt %d)", interposer->socket_path, strerror(errno), attempt);
            close(interposer->sockfd);
            interposer->sockfd = -1;
            return -1;
        }
        break; 
    }
    if (interposer->sockfd == -1 || attempt >= SOCKET_CONNECT_TIMEOUT_MS) 
    {
        interposer_log(LOG_ERROR, "Timed out connecting to socket %s after %d attempts.", interposer->socket_path, attempt-1);
        if(interposer->sockfd != -1) close(interposer->sockfd); 
        interposer->sockfd = -1;
        return -1;
    }
    interposer_log(LOG_INFO, "Connected to socket %s (fd %d)", interposer->socket_path, interposer->sockfd);

    if (read_config(interposer->sockfd, &(interposer->js_config)) != 0)
    {
        interposer_log(LOG_ERROR, "Failed to read config from socket: %s", interposer->socket_path);
        close(interposer->sockfd);
        interposer->sockfd = -1;
        return -1;
    }

    unsigned char arch_byte[1] = { (unsigned char)sizeof(unsigned long) };
    interposer_log(LOG_INFO, "Sending architecture specifier: %u bytes (sizeof(unsigned long))", arch_byte[0]);
    if (write(interposer->sockfd, arch_byte, sizeof(arch_byte)) != sizeof(arch_byte)) {
        interposer_log(LOG_ERROR, "Failed to send architecture specifier to %s: %s", interposer->socket_path, strerror(errno));
        close(interposer->sockfd);
        interposer->sockfd = -1;
        return -1;
    }
    interposer_log(LOG_INFO, "Successfully sent architecture specifier.");
    return 0; 
}

int epoll_ctl(int epfd, int op, int fd, struct epoll_event *event)
{
    if (!real_epoll_ctl) {
        interposer_log(LOG_ERROR, "CRITICAL: real_epoll_ctl not loaded in epoll_ctl.");
        errno = EFAULT; 
        return -1;
    }
    if (op == EPOLL_CTL_ADD)
    {
        for (size_t i = 0; i < NUM_INTERPOSERS(); i++)
        {
            if (fd == interposers[i].sockfd && interposers[i].sockfd != -1)
            {
                interposer_log(LOG_INFO, "Socket %s (fd %d) was added to epoll (epfd %d). Ensuring non-blocking.", interposers[i].socket_path, fd, epfd);
                if (make_nonblocking(fd) == -1)
                {
                    interposer_log(LOG_WARN, "Failed to make socket %d non-blocking during epoll_ctl.", fd);
                }
                break;
            }
        }
    }
    return real_epoll_ctl(epfd, op, fd, event);
}


int common_open_logic(const char *pathname, js_interposer_t **found_interposer) {
    *found_interposer = NULL;
    for (size_t i = 0; i < NUM_INTERPOSERS(); i++) {
        if (strcmp(pathname, interposers[i].open_dev_name) == 0) {
            if (interposers[i].sockfd != -1) {
                interposer_log(LOG_INFO, "Device %s already open with fd %d. Returning existing fd.", pathname, interposers[i].sockfd);
                *found_interposer = &interposers[i]; 
                return interposers[i].sockfd; 
            }
            if (interposer_open_socket(&interposers[i]) == -1) {
                interposer_log(LOG_ERROR, "interposer_open_socket failed for %s", pathname);
                errno = EIO; 
                return -1;   
            }
            *found_interposer = &interposers[i];
            interposer_log(LOG_INFO, "Successfully interposed 'open' for %s, assigned socket fd: %d", pathname, interposers[i].sockfd);
            return interposers[i].sockfd; 
        }
    }
    return -2; 
}

int open(const char *pathname, int flags, ...)
{
    if (!real_open) {
        interposer_log(LOG_ERROR, "CRITICAL: real_open not loaded in open.");
        errno = EFAULT; return -1;
    }

    js_interposer_t *interposer = NULL;
    int result_fd = common_open_logic(pathname, &interposer);

    if (result_fd == -2) { 
        mode_t mode = 0;
        if (flags & O_CREAT) {
            va_list args;
            va_start(args, flags);
            mode = va_arg(args, mode_t);
            va_end(args);
            return real_open(pathname, flags, mode);
        } else {
            return real_open(pathname, flags);
        }
    }
    return result_fd;
}

// Undefine open64 if it's a macro, to prevent redefinition when we define our own open64.
// This is common on systems where _LARGEFILE64_SOURCE makes open64 an alias for open.
#ifdef open64
#undef open64
#endif
// Interposer function for open64
int open64(const char *pathname, int flags, ...)
{
    js_interposer_t *interposer = NULL;
    int result_fd = common_open_logic(pathname, &interposer);

    if (result_fd == -2) { // Not an interposed path
        mode_t mode = 0;
        if (flags & O_CREAT) {
            va_list args;
            va_start(args, flags);
            mode = va_arg(args, mode_t);
            va_end(args);
        }

        if (real_open64) { // If real_open64 was successfully dlsym'd
            if (flags & O_CREAT) {
                return real_open64(pathname, flags, mode);
            } else {
                return real_open64(pathname, flags);
            }
        } else {
            // real_open64 is NULL (dlsym failed or it wasn't found).
            // Fall back to real_open. A warning about "open64" not being found
            // would have been logged by load_real_func in init_interposer.
            interposer_log(LOG_INFO, "real_open64 not available, falling back to real_open for path: %s", pathname);
            if (!real_open) {
                // This is a very critical error, as real_open should always be available.
                interposer_log(LOG_ERROR, "CRITICAL: real_open is NULL in open64 fallback. Interposer init likely failed for 'open'.");
                errno = EFAULT;
                return -1;
            }
            if (flags & O_CREAT) {
                return real_open(pathname, flags, mode);
            } else {
                return real_open(pathname, flags);
            }
        }
    }
    return result_fd;
}


int close(int fd)
{
   if (!real_close) {
        interposer_log(LOG_ERROR, "CRITICAL: real_close not loaded in close.");
        errno = EFAULT; return -1;
    }

    js_interposer_t *interposer = NULL;
    for (size_t i = 0; i < NUM_INTERPOSERS(); i++)
    {
        if (fd >= 0 && fd == interposers[i].sockfd)
        {
            interposer = &interposers[i];
            break;
        }
    }

    if (interposer != NULL)
    {
        interposer_log(LOG_INFO, "Intercepted 'close' for interposed fd %d (device %s, socket %s). Closing socket.",
                       fd, interposer->open_dev_name, interposer->socket_path);
        int ret = real_close(fd); 
        if (ret == 0) {
            interposer_log(LOG_INFO, "Socket fd %d closed successfully. Marking interposer slot as free.", fd);
            interposer->sockfd = -1; 
            memset(&(interposer->js_config), 0, sizeof(js_config_t)); 
        } else {
            interposer_log(LOG_ERROR, "real_close on socket fd %d failed: %s. State may be inconsistent.", fd, strerror(errno));
        }
        return ret; 
    }
    return real_close(fd);
}

ssize_t read(int fd, void *buf, size_t count)
{
    if (!real_read) {
        interposer_log(LOG_ERROR, "CRITICAL: real_read not loaded in read().");
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

    if (interposer == NULL) {
        // Not our fd, pass to real_read
        return real_read(fd, buf, count);
    }

    interposer_log(LOG_INFO, "Intercepted 'read' for interposed fd %d (device %s, type %d), requested %zu bytes.",
                   fd, interposer->open_dev_name, interposer->type, count);

    size_t event_size;
    if (interposer->type == DEV_TYPE_JS) {
        event_size = sizeof(struct js_event); // Typically 8 bytes
        interposer_log(LOG_INFO, "read() for JS device: event_size = %zu", event_size);
    } else if (interposer->type == DEV_TYPE_EV) {
        // Calculate based on arch byte sent to server (sizeof(long) for timeval)
        // struct timeval (2 * sizeof(long)), type (2), code (2), value (4)
        // This assumes sizeof(long) accurately reflects the architecture for timeval.
        // The `arch_byte` sent to Python was sizeof(unsigned long).
        // For struct input_event: struct timeval time; __u16 type; __u16 code; __s32 value;
        // So timeval is 2 * sizeof(long) on most systems for sec and usec.
        event_size = (2 * sizeof(long)) + sizeof(uint16_t) + sizeof(uint16_t) + sizeof(int32_t);
        interposer_log(LOG_INFO, "read() for EV device: event_size = %zu (based on sizeof(long)=%zu)", event_size, sizeof(long));
    } else {
        interposer_log(LOG_ERROR, "read(): Unknown interposer type %d for fd %d", interposer->type, fd);
        errno = EBADF;
        return -1;
    }

    if (count == 0) { // Application requested zero bytes.
        return 0;
    }

    if (count < event_size) {
        interposer_log(LOG_WARN, "read() for %s: application buffer too small (%zu bytes) for a single event_size (%zu bytes). Returning -EINVAL.",
                       interposer->open_dev_name, count, event_size);
        errno = EINVAL; // Common practice if buffer is too small for minimum unit
        return -1;
    }

    // We need to read exactly one event_size from the socket.
    // The socket is (or should be) non-blocking due to epoll_ctl logic or explicit setting.
    size_t bytes_read_total = 0;
    char *buffer_ptr = (char *)buf;

    // We will only return one event at a time, even if `count` is larger.
    // This matches how evdev devices typically behave with read().
    size_t target_read_size = event_size;

    // Loop to ensure a full event is read from the (potentially non-blocking) socket
    struct timespec start_time, current_time;
    clock_gettime(CLOCK_MONOTONIC, &start_time);
    const long read_timeout_ns = 2000000000; // 2 seconds timeout for a single event read, adjust as needed

    while (bytes_read_total < target_read_size) {
        ssize_t current_read = recv(interposer->sockfd, buffer_ptr + bytes_read_total, target_read_size - bytes_read_total, 0);

        if (current_read == -1) {
            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                // Socket is non-blocking and no data right now.
                // Check if the application opened the fd with O_NONBLOCK.
                // If so, we should return -EAGAIN.
                // For now, we make it blocking with a timeout.
                // Check for timeout
                clock_gettime(CLOCK_MONOTONIC, &current_time);
                long elapsed_ns = (current_time.tv_sec - start_time.tv_sec) * 1000000000L + (current_time.tv_nsec - start_time.tv_nsec);
                if (elapsed_ns > read_timeout_ns) {
                    interposer_log(LOG_WARN, "read() on socket %d: Timeout waiting for event data after %ld ns.", interposer->sockfd, elapsed_ns);
                    // If some bytes were read, it's an incomplete event.
                    // If no bytes read, could return EAGAIN if app expects non-blocking.
                    // For simplicity, returning an error for timeout.
                    errno = ETIMEDOUT;
                    return -1;
                }
                usleep(1000); // Small sleep to yield CPU
                continue;
            }
            interposer_log(LOG_ERROR, "read() on socket %d: recv error: %s", interposer->sockfd, strerror(errno));
            return -1; // Propagate other errors
        } else if (current_read == 0) {
            interposer_log(LOG_INFO, "read() on socket %d: recv returned 0 (EOF). Peer closed connection.", interposer->sockfd);
            if (bytes_read_total > 0 && bytes_read_total < target_read_size) {
                 interposer_log(LOG_ERROR, "read() on socket %d: EOF mid-event after %zu bytes.", interposer->sockfd, bytes_read_total);
                 errno = EPIPE;
                 return -1;
            }
            return 0; // Clean EOF, no bytes read for this event, or EOF between events
        }
        bytes_read_total += current_read;
    }

    interposer_log(LOG_INFO, "Successfully read %zu bytes for one event from %s (fd %d).",
                   bytes_read_total, interposer->open_dev_name, fd);
    return bytes_read_total; // Should be event_size
}

int intercept_js_ioctl(js_interposer_t *interposer, int fd, ioctl_request_t request, void *arg)
{
    int len;
    uint8_t *u8_ptr;
    uint16_t *u16_ptr;

    switch (_IOC_NR(request))
    {
    case 0x01: 
        interposer_log(LOG_INFO, "IOCTL(%s): JSIOCGVERSION (0x%08lx) -> 0x%08x", interposer->open_dev_name, (unsigned long)request, JS_VERSION); 
        if (!arg) return -EINVAL;
        *((uint32_t *)arg) = JS_VERSION;
        return 0;
    case 0x11: 
        interposer_log(LOG_INFO, "IOCTL(%s): JSIOCGAXES (0x%08lx) -> %u axes", interposer->open_dev_name, (unsigned long)request, interposer->js_config.num_axes); 
        if (!arg) return -EINVAL;
        *((uint8_t *)arg) = interposer->js_config.num_axes;
        return 0;
    case 0x12: 
        interposer_log(LOG_INFO, "IOCTL(%s): JSIOCGBUTTONS (0x%08lx) -> %u buttons", interposer->open_dev_name, (unsigned long)request, interposer->js_config.num_btns); 
        if (!arg) return -EINVAL;
        *((uint8_t *)arg) = interposer->js_config.num_btns;
        return 0;
    case 0x13: 
        len = _IOC_SIZE(request);
        interposer_log(LOG_INFO, "IOCTL(%s): JSIOCGNAME(%d) (0x%08lx) -> '%s'", interposer->open_dev_name, len, (unsigned long)request, interposer->js_config.name); 
        if (!arg) return -EINVAL;
        strncpy((char *)arg, interposer->js_config.name, len -1 );
        ((char *)arg)[len - 1] = '\0'; 
        return strlen((char*)arg); 
    case 0x21: 
        interposer_log(LOG_INFO, "IOCTL(%s): JSIOCSCORR (0x%08lx) (noop)", interposer->open_dev_name, (unsigned long)request); 
        if (!arg) return -EINVAL;
        memcpy(&interposer->corr, arg, sizeof(js_corr_t)); 
        return 0;
    case 0x22: 
        interposer_log(LOG_INFO, "IOCTL(%s): JSIOCGCORR (0x%08lx)", interposer->open_dev_name, (unsigned long)request); 
        if (!arg) return -EINVAL;
        memcpy(arg, &interposer->corr, sizeof(js_corr_t));
        return 0;
    case 0x31: 
        interposer_log(LOG_WARN, "IOCTL(%s): JSIOCSAXMAP (0x%08lx) (not supported, config from socket)", interposer->open_dev_name, (unsigned long)request); 
        return -EPERM; 
    case 0x32: 
        interposer_log(LOG_INFO, "IOCTL(%s): JSIOCGAXMAP (0x%08lx) for %u axes", interposer->open_dev_name, (unsigned long)request, interposer->js_config.num_axes); 
        if (!arg) return -EINVAL;
        u8_ptr = (uint8_t *)arg;
        if (_IOC_SIZE(request) < interposer->js_config.num_axes) return -EINVAL; 
        memcpy(u8_ptr, interposer->js_config.axes_map, interposer->js_config.num_axes * sizeof(uint8_t));
        return 0;
    case 0x33: 
        interposer_log(LOG_WARN, "IOCTL(%s): JSIOCSBTNMAP (0x%08lx) (not supported, config from socket)", interposer->open_dev_name, (unsigned long)request); 
        return -EPERM;
    case 0x34: 
        interposer_log(LOG_INFO, "IOCTL(%s): JSIOCGBTNMAP (0x%08lx) for %u buttons", interposer->open_dev_name, (unsigned long)request, interposer->js_config.num_btns); 
        if (!arg) return -EINVAL;
        u16_ptr = (uint16_t *)arg;
        if (_IOC_SIZE(request) < interposer->js_config.num_btns * sizeof(uint16_t)) return -EINVAL;
        memcpy(u16_ptr, interposer->js_config.btn_map, interposer->js_config.num_btns * sizeof(uint16_t));
        return 0;
    default:
        interposer_log(LOG_WARN, "Unhandled 'joystick' ioctl for %s: request 0x%02lx (NR=0x%02x)", interposer->open_dev_name, (unsigned long)request, _IOC_NR(request)); 
        return -ENOTTY; 
    }
}

int intercept_ev_ioctl(js_interposer_t *interposer, int fd, ioctl_request_t request, void *arg)
{
    struct input_absinfo *absinfo;
    struct input_id *id;
    int ev_version = 0x010001;
    int len;
    unsigned int i;

    // First, handle ioctls that are identified by _IOC_TYPE and _IOC_NR,
    // like EVIOCGABS, EVIOCGNAME, EVIOCGPROP, EVIOCGKEY, EVIOCGBIT.
    // This order helps if some macros might incidentally match values used by these.

    if (_IOC_TYPE(request) == 'E' && _IOC_NR(request) >= 0x40 && _IOC_NR(request) < (0x40 + ABS_CNT)) { // EVIOCGABS(code)
        uint8_t abs_code = _IOC_NR(request) - 0x40;
        absinfo = (struct input_absinfo *)arg;
        if (!absinfo) {
            errno = EINVAL;
            return -1;
        }

        absinfo->value = 0;
        absinfo->minimum = ABS_AXIS_MIN_DEFAULT;
        absinfo->maximum = ABS_AXIS_MAX_DEFAULT;
        absinfo->fuzz = 16;
        absinfo->flat = 128;
        absinfo->resolution = 0;

        if (abs_code == ABS_Z || abs_code == ABS_RZ ||
            abs_code == ABS_THROTTLE || abs_code == ABS_RUDDER ||
            abs_code == ABS_WHEEL || abs_code == ABS_GAS || abs_code == ABS_BRAKE) {
            absinfo->minimum = ABS_TRIGGER_MIN_DEFAULT;
            absinfo->maximum = ABS_TRIGGER_MAX_DEFAULT;
            absinfo->fuzz = 0;
            absinfo->flat = 0;
        } else if (abs_code >= ABS_HAT0X && abs_code <= ABS_HAT3Y) {
            absinfo->minimum = ABS_HAT_MIN_DEFAULT;
            absinfo->maximum = ABS_HAT_MAX_DEFAULT;
            absinfo->fuzz = 0;
            absinfo->flat = 0;
        }
        interposer_log(LOG_INFO, "IOCTL(%s): EVIOCGABS(0x%02x) (0x%08lx) min:%d max:%d",
                       interposer->open_dev_name, abs_code, (unsigned long)request, absinfo->minimum, absinfo->maximum);
        return 0;
    }

    if (_IOC_TYPE(request) == 'E' && _IOC_NR(request) == 0x06) { // EVIOCGNAME base
        len = _IOC_SIZE(request);
        interposer_log(LOG_INFO, "IOCTL(%s): EVIOCGNAME(%u) (0x%08lx) for name '%s'",
                       interposer->open_dev_name, (unsigned int)len, (unsigned long)request, interposer->js_config.name);
        if (!arg) {
            interposer_log(LOG_WARN, "IOCTL(%s): EVIOCGNAME called with NULL argument.", interposer->open_dev_name);
            errno = EINVAL;
            return -1;
        }
        if (len == 0) {
            interposer_log(LOG_INFO, "IOCTL(%s): EVIOCGNAME with len 0. Returning 0.", interposer->open_dev_name);
            return 0;
        }
        strncpy((char *)arg, interposer->js_config.name, len - 1);
        ((char *)arg)[len - 1] = '\0';
        return strlen((char *)arg);
    }

    if (_IOC_TYPE(request) == 'E' && _IOC_NR(request) == 0x09) { // EVIOCGPROP base
        len = _IOC_SIZE(request);
        interposer_log(LOG_INFO, "IOCTL(%s): EVIOCGPROP(%d) (0x%08lx) (returning 0 props)",
                       interposer->open_dev_name, len, (unsigned long)request);
        if (!arg) {
            errno = EINVAL;
            return -1;
        }
        if (len > 0) memset(arg, 0, len);
        return 0;
    }

    if (_IOC_TYPE(request) == 'E' && _IOC_NR(request) == 0x18) { // EVIOCGKEY base
        len = _IOC_SIZE(request);
        interposer_log(LOG_INFO, "IOCTL(%s): EVIOCGKEY(%d) (0x%08lx) (returning all keys up)",
                       interposer->open_dev_name, len, (unsigned long)request);
        if (!arg) {
            errno = EINVAL;
            return -1;
        }
        if (len > 0) memset(arg, 0, len);
        return 0;
    }

    // General EVIOCGBIT handling
    if (_IOC_TYPE(request) == 'E' && _IOC_NR(request) >= 0x20 && _IOC_NR(request) < 0x40) { // EVIOCGBIT range
        unsigned char ev_type_query = _IOC_NR(request) - 0x20;
        len = _IOC_SIZE(request);
        if (!arg) {
            errno = EINVAL;
            return -1;
        }
        memset(arg, 0, len);

        interposer_log(LOG_INFO, "IOCTL(%s): EVIOCGBIT for EV type 0x%02x, len %d (0x%08lx)",
                       interposer->open_dev_name, ev_type_query, len, (unsigned long)request);

        if (ev_type_query == 0) { // Query for supported event types
            if (EV_SYN / 8 < len) ((unsigned char *)arg)[EV_SYN / 8] |= (1 << (EV_SYN % 8));
            if (EV_KEY / 8 < len) ((unsigned char *)arg)[EV_KEY / 8] |= (1 << (EV_KEY % 8));
            if (EV_ABS / 8 < len) ((unsigned char *)arg)[EV_ABS / 8] |= (1 << (EV_ABS % 8));
            // Return value for EVIOCGBIT should be the number of bytes written into the buffer,
            // which is 'len' if the buffer is large enough, or the actual max bytes needed.
            // For simplicity and common practice, returning 'len' (bytes copied, which is all zeros then set bits)
            // or the actual number of bytes for the bitmask could be more precise.
            // Let's return len, as we've zeroed it and then potentially set bits.
            return len;
        }
        else if (ev_type_query == EV_KEY) { // Query for supported key codes
            for (i = 0; i < interposer->js_config.num_btns; ++i) {
                int key_code = interposer->js_config.btn_map[i];
                if (key_code >= 0 && key_code < KEY_MAX && (key_code / 8 < len)) {
                    ((unsigned char *)arg)[key_code / 8] |= (1 << (key_code % 8));
                }
            }
            return len;
        }
        else if (ev_type_query == EV_ABS) { // Query for supported absolute axis codes
            for (i = 0; i < interposer->js_config.num_axes; ++i) {
                int abs_code = interposer->js_config.axes_map[i];
                 if (abs_code >= 0 && abs_code < ABS_MAX && (abs_code / 8 < len)) {
                    ((unsigned char *)arg)[abs_code / 8] |= (1 << (abs_code % 8));
                }
            }
            return len;
        }
        return len; // Return len for other EV_types, effectively an empty bitmask
    }

    // Now, use a switch for ioctl macros that define a unique constant value
    // Switch directly on 'request' (type ioctl_request_t) to avoid sign-extension issues on Musl
    switch (request)
    {
    case EVIOCGVERSION:
        interposer_log(LOG_INFO, "IOCTL(%s): EVIOCGVERSION (0x%08lx) -> 0x%08x",
                       interposer->open_dev_name, (unsigned long)request, ev_version);
        if (!arg) {
            errno = EINVAL;
            return -1;
        }
        *((int *)arg) = ev_version;
        return 0;

    case EVIOCGID:
        id = (struct input_id *)arg;
        if (!id) {
            errno = EINVAL;
            return -1;
        }
        memset(id, 0, sizeof(struct input_id));
        id->bustype = BUS_VIRTUAL;
        id->vendor = interposer->js_config.vendor;
        id->product = interposer->js_config.product;
        id->version = interposer->js_config.version;
        interposer_log(LOG_INFO, "IOCTL(%s): EVIOCGID (0x%08lx) -> bus:0x%04x, ven:0x%04x, prod:0x%04x, ver:0x%04x",
                       interposer->open_dev_name, (unsigned long)request, id->bustype, id->vendor, id->product, id->version);
        return 0;

    case EVIOCGRAB:
        // For EVIOCGRAB, arg is (void*)0 or (void*)1. Don't dereference.
        interposer_log(LOG_INFO, "IOCTL(%s): EVIOCGRAB (0x%08lx) (arg_ptr_value: %p) (noop, success)",
                       interposer->open_dev_name,
                       (unsigned long)request,
                       arg);
        // EVIOCGRAB is a no-op in this interposer, always return success.
        // The actual grab state is not emulated here.
        return 0;

    // Add other specific 'E' type ioctls here if they are simple macros
    // and not covered by the _IOC_TYPE/_IOC_NR checks above.
    // Example: EVIOCGPHYS, EVIOCGUNIQ, EVIOCGKEYCODE, EVIOCSKEYCODE, etc.
    // if they are simple #defines and not complex _IOR/_IOW macros that might
    // overlap with the generic handlers above. For most common ones, the
    // _IOC_TYPE/_IOC_NR handlers are more robust.

    default:
        // If it's not one of the specific cases or generic handlers above
        interposer_log(LOG_WARN, "Unhandled EVDEV ioctl for %s: request 0x%08lx (Type '%c', NR 0x%02x, Size %d)",
                       interposer->open_dev_name, (unsigned long)request, _IOC_TYPE(request), _IOC_NR(request), _IOC_SIZE(request));
        errno = ENOTTY; // Inappropriate ioctl for device
        return -1;
    }
}

int ioctl(int fd, ioctl_request_t request, ...)
{
    if (!real_ioctl) {
        interposer_log(LOG_ERROR, "CRITICAL: real_ioctl not loaded in ioctl.");
        errno = EFAULT; return -1;
    }

    va_list args_list; 
    va_start(args_list, request);
    void *arg_ptr = va_arg(args_list, void *); 
    va_end(args_list);

    js_interposer_t *interposer = NULL;
    for (size_t i = 0; i < NUM_INTERPOSERS(); i++)
    {
        if (fd == interposers[i].sockfd && interposers[i].sockfd != -1)
        {
            interposer = &interposers[i];
            break;
        }
    }

    if (interposer == NULL)
    {
        return real_ioctl(fd, request, arg_ptr);
    }

    if (interposer->type == DEV_TYPE_JS && _IOC_TYPE(request) == 'j')
    {
        return intercept_js_ioctl(interposer, fd, request, arg_ptr);
    }
    else if (interposer->type == DEV_TYPE_EV && _IOC_TYPE(request) == 'E')
    {
        return intercept_ev_ioctl(interposer, fd, request, arg_ptr);
    }
    else if (interposer->type == DEV_TYPE_EV && _IOC_TYPE(request) == 'H') { 
        interposer_log(LOG_WARN, "IOCTL(%s): HID ioctl 0x%lx received but not handled.", interposer->open_dev_name, (unsigned long)request); 
        return -ENOTTY; // We are not a HID device
    }
    else if (_IOC_TYPE(request) == 'f') { // Typically fcntl commands, FIONREAD often 'f' or 't' (TIOCINQ)
        // FIONREAD is 0x541B (TIOCINQ). _IOC_TYPE(0x541B) is 'T', _IOC_NR(0x541B) is 0x1B.
        // Some systems define FIONREAD as _IOR('f', 127, int) -> type 'f', nr 127.
        // So checking type 'f' is reasonable, but also check the specific request value.
        if ((unsigned long)request == FIONREAD) { 
            interposer_log(LOG_INFO, "IOCTL(%s): FIONREAD (0x%08lx). (Returning 0, needs proper implementation if app relies on it)",
                           interposer->open_dev_name, (unsigned long)request); 
            if (!arg_ptr) return -EINVAL;
            *(int*)arg_ptr = 0; 
            return 0;
        }
    }

    interposer_log(LOG_WARN, "IOCTL(%s): Mismatched ioctl type 0x%x for device type %d, or unhandled ioctl 0x%08lx. Passing to real_ioctl is unlikely to work as expected.",
                   interposer->open_dev_name, _IOC_TYPE(request), interposer->type, (unsigned long)request); 
    // For unknown ioctls on our interposed fd (which is a socket),
    // passing to real_ioctl(socket_fd, ...) will likely result in ENOTTY or EINVAL
    // from the kernel if the ioctl is not socket-related.
    return real_ioctl(fd, request, arg_ptr); 
}
