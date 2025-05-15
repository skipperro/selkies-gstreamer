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
    if (*target_func_ptr == NULL) // Check against *target_func_ptr, not target_func_ptr itself
    {
        // Log as warning for optional functions like open64, error for essential ones if needed
        // For now, consistently log as error and let the calling logic decide if it's fatal.
        interposer_log(LOG_ERROR, "Error getting original '%s' function: %s", name, dlerror());
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
// read is not explicitly interposed in the original, but good to have if needed for debugging
// static ssize_t (*real_read)(int fd, void *buf, size_t count) = NULL;

// Initialization function to load the real functions
__attribute__((constructor)) void init_interposer()
{
    if (load_real_func((void *)&real_open, "open") < 0) {
        // This is critical, if open cannot be loaded, the interposer is mostly useless.
        // Consider exiting or a more prominent error. For now, it logs.
    }
    // Attempt to load open64. It's okay if this fails (real_open64 will remain NULL).
    // The open64() wrapper will handle the fallback.
    load_real_func((void *)&real_open64, "open64"); 

    if (load_real_func((void *)&real_ioctl, "ioctl") < 0) { /* Similar critical consideration */ }
    if (load_real_func((void *)&real_epoll_ctl, "epoll_ctl") < 0) { /* ... */ }
    if (load_real_func((void *)&real_close, "close") < 0) { /* ... */ }
    // load_real_func((void *)&real_read, "read");
}

// Type definition for correction struct (from joystick.h, often empty or unused by modern drivers)
typedef struct js_corr js_corr_t;


// Constants from Python to define js_config_t structure
#define CONTROLLER_NAME_MAX_LEN 255
#define INTERPOSER_MAX_BTNS 512
#define INTERPOSER_MAX_AXES 64

// This structure MUST match the layout and size of the data sent by the Python server.
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


// Struct for storing information about each interposed joystick device.
typedef struct
{
    uint8_t type; // DEV_TYPE_JS or DEV_TYPE_EV
    char open_dev_name[255];
    char socket_path[255];
    int sockfd;
    js_corr_t corr; 
    js_config_t js_config; 
} js_interposer_t;

#define DEV_TYPE_JS 0
#define DEV_TYPE_EV 1

// Min/max values for ABS axes
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
        ssize_t current_read = read(fd, buffer_ptr + bytes_read_total, bytes_to_read - bytes_read_total);
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
    if (!real_epoll_ctl) { // Should have been loaded by init_interposer
         if (load_real_func((void *)&real_epoll_ctl, "epoll_ctl") < 0) {
            errno = EFAULT; 
            return -1;
        }
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
    if (!real_open) { // Should have been loaded by init_interposer
         if (load_real_func((void *)&real_open, "open") < 0) {
            errno = EFAULT; return -1;
        }
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

// Interposer function for open64
int open64(const char *pathname, int flags, ...)
{
    // real_open and real_open64 are attempted to be loaded in init_interposer.
    // If real_open64 dlsym failed, real_open64 will be NULL.

    js_interposer_t *interposer = NULL;
    int result_fd = common_open_logic(pathname, &interposer); // Handles interposed paths

    if (result_fd == -2) { // Not an interposed path, call the real underlying function
        mode_t mode = 0;
        // Va_list handling must be done regardless of which real function is called
        if (flags & O_CREAT) {
            va_list args;
            va_start(args, flags);
            mode = va_arg(args, mode_t);
            va_end(args);
        }

        if (real_open64) { // If open64 was found and loaded by init_interposer
            if (flags & O_CREAT) {
                return real_open64(pathname, flags, mode);
            } else {
                return real_open64(pathname, flags);
            }
        } else {
            // open64 was not found (real_open64 is NULL). Fall back to real_open.
            // The error for failing to dlsym "open64" would have been logged by load_real_func in init_interposer.
            interposer_log(LOG_INFO, "real_open64 not available. Falling back to real_open for path: %s", pathname);
            
            if (!real_open) {
                 // This is a critical state. init_interposer should have loaded real_open.
                 // If an application calls open64 and real_open wasn't loaded, something is very wrong.
                 interposer_log(LOG_ERROR, "CRITICAL: real_open is NULL in open64 fallback. Interposer init failed for 'open'.");
                 errno = EFAULT; // Or some other suitable error indicating a severe problem.
                 return -1;
            }

            if (flags & O_CREAT) {
                return real_open(pathname, flags, mode);
            } else {
                return real_open(pathname, flags);
            }
        }
    }
    // If result_fd is -1 (error in common_open_logic for an interposed path)
    // or a valid fd from successful interposition, return it.
    return result_fd;
}


int close(int fd)
{
   if (!real_close) { // Should have been loaded by init_interposer
         if (load_real_func((void *)&real_close, "close") < 0) {
            errno = EFAULT; return -1;
        }
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

    if (_IOC_TYPE(request) == 'E' && _IOC_NR(request) >= 0x40 && _IOC_NR(request) < (0x40 + ABS_CNT)) {
        uint8_t abs_code = _IOC_NR(request) - 0x40;
        absinfo = (struct input_absinfo *)arg;
        if (!absinfo) return -EINVAL;

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
        int found_axis = 0;
        for(i=0; i < interposer->js_config.num_axes; ++i) {
            if (interposer->js_config.axes_map[i] == abs_code) {
                found_axis = 1;
                break;
            }
        }
        if(!found_axis) {
            // Provide defaults even if not explicitly in our map, some apps query all.
        }
        interposer_log(LOG_INFO, "IOCTL(%s): EVIOCGABS(0x%02x) (0x%08lx) min:%d max:%d", interposer->open_dev_name, abs_code, (unsigned long)request, absinfo->minimum, absinfo->maximum); 
        return 0; 
    }

    unsigned long ul_request = (unsigned long)request; // For switch cases that use defined constants

    switch (ul_request) 
    {
    case EVIOCGVERSION:
        interposer_log(LOG_INFO, "IOCTL(%s): EVIOCGVERSION (0x%08lx) -> 0x%08x", interposer->open_dev_name, (unsigned long)request, ev_version); 
        if (!arg) return -EINVAL;
        *((int *)arg) = ev_version;
        return 0;
    case EVIOCGID:
        id = (struct input_id *)arg;
        if (!id) return -EINVAL;
        memset(id, 0, sizeof(struct input_id));
        id->bustype = BUS_VIRTUAL; 
        id->vendor = interposer->js_config.vendor;
        id->product = interposer->js_config.product;
        id->version = interposer->js_config.version;
        interposer_log(LOG_INFO, "IOCTL(%s): EVIOCGID (0x%08lx) -> bus:0x%04x, ven:0x%04x, prod:0x%04x, ver:0x%04x",
                       interposer->open_dev_name, (unsigned long)request, id->bustype, id->vendor, id->product, id->version); 
        return 0;
    case EVIOCGRAB:
        interposer_log(LOG_INFO, "IOCTL(%s): EVIOCGRAB (0x%08lx) (arg: %p, val: %d) (noop, success)",
                       interposer->open_dev_name, (unsigned long)request, arg, arg ? *((int*)arg) : -1); 
        return 0;
    }

    if (_IOC_TYPE(request) == 'E' && _IOC_NR(request) == 0x06) { // EVIOCGNAME base
        len = _IOC_SIZE(request);
        interposer_log(LOG_INFO, "IOCTL(%s): EVIOCGNAME(%u) (0x%08lx) for name '%s'", interposer->open_dev_name, (unsigned int)len, (unsigned long)request, interposer->js_config.name); 
        if (!arg) {
            interposer_log(LOG_WARN, "IOCTL(%s): EVIOCGNAME called with NULL argument.", interposer->open_dev_name);
            return -EINVAL;
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
        interposer_log(LOG_INFO, "IOCTL(%s): EVIOCGPROP(%d) (0x%08lx) (returning 0 props)", interposer->open_dev_name, len, (unsigned long)request); 
        if (!arg) return -EINVAL;
        if (len > 0) memset(arg, 0, len); 
        return 0; 
    }

    if (_IOC_TYPE(request) == 'E' && _IOC_NR(request) == 0x18) { // EVIOCGKEY base
        len = _IOC_SIZE(request);
        interposer_log(LOG_INFO, "IOCTL(%s): EVIOCGKEY(%d) (0x%08lx) (returning all keys up)", interposer->open_dev_name, len, (unsigned long)request); 
        if (!arg) return -EINVAL;
        if (len > 0) memset(arg, 0, len); 
        return 0; 
    }

    if (_IOC_TYPE(request) == 'E' && _IOC_NR(request) >= 0x20 && _IOC_NR(request) < 0x40) {
        unsigned char ev_type_query = _IOC_NR(request) - 0x20;
        len = _IOC_SIZE(request);
        if (!arg) return -EINVAL;
        memset(arg, 0, len); 

        interposer_log(LOG_INFO, "IOCTL(%s): EVIOCGBIT for EV type 0x%02x, len %d (0x%08lx)",
                       interposer->open_dev_name, ev_type_query, len, (unsigned long)request); 

        if (ev_type_query == 0) { 
            if (EV_SYN < len * 8) ((unsigned char *)arg)[EV_SYN / 8] |= (1 << (EV_SYN % 8));
            if (EV_KEY < len * 8) ((unsigned char *)arg)[EV_KEY / 8] |= (1 << (EV_KEY % 8));
            if (EV_ABS < len * 8) ((unsigned char *)arg)[EV_ABS / 8] |= (1 << (EV_ABS % 8));
            return len; 
        }
        else if (ev_type_query == EV_KEY) { 
            for (i = 0; i < interposer->js_config.num_btns; ++i) {
                int key_code = interposer->js_config.btn_map[i];
                if (key_code >= 0 && key_code < KEY_MAX && key_code < len * 8) { 
                    ((unsigned char *)arg)[key_code / 8] |= (1 << (key_code % 8));
                }
            }
            return len;
        }
        else if (ev_type_query == EV_ABS) { 
            for (i = 0; i < interposer->js_config.num_axes; ++i) {
                int abs_code = interposer->js_config.axes_map[i];
                 if (abs_code >= 0 && abs_code < ABS_MAX && abs_code < len * 8) { 
                    ((unsigned char *)arg)[abs_code / 8] |= (1 << (abs_code % 8));
                }
            }
            return len;
        }
        return len; 
    }

    interposer_log(LOG_WARN, "Unhandled EVDEV ioctl for %s: request 0x%08lx (Type 'E', NR 0x%02x)",
                   interposer->open_dev_name, (unsigned long)request, _IOC_NR(request)); 
    return -ENOTTY; 
}

int ioctl(int fd, ioctl_request_t request, ...)
{
    if (!real_ioctl) { // Should have been loaded by init_interposer
         if (load_real_func((void *)&real_ioctl, "ioctl") < 0) {
             errno = EFAULT; return -1;
        }
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
        interposer_log(LOG_WARN, "IOCTL(%s): HID ioctl 0x%lx received but not handled (pass to real_ioctl)", interposer->open_dev_name, (unsigned long)request); 
        return -ENOTTY;
    }
    else if (_IOC_TYPE(request) == 'f') { 
        // Check if request is FIONREAD. Note FIONREAD might be an int or unsigned long depending on headers.
        // Cast to unsigned long for comparison with defined FIONREAD to be safe if ioctl_request_t is int.
        if ((unsigned long)request == FIONREAD) { 
            interposer_log(LOG_INFO, "IOCTL(%s): FIONREAD (0x%08lx). (Returning 0, needs proper implementation if app relies on it)",
                           interposer->open_dev_name, (unsigned long)request); 
            if (!arg_ptr) return -EINVAL;
            *(int*)arg_ptr = 0; 
            return 0;
        }
    }

    interposer_log(LOG_WARN, "IOCTL(%s): Mismatched ioctl type 0x%x for device type %d, or unhandled ioctl 0x%08lx. Passing to real_ioctl.",
                   interposer->open_dev_name, _IOC_TYPE(request), interposer->type, (unsigned long)request); 
    return real_ioctl(fd, request, arg_ptr); 
}
