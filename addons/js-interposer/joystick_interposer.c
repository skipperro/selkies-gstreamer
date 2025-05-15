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
        interposer_log(LOG_ERROR, "Error getting original '%s' function: %s", name, dlerror());
        return -1;
    }
    return 0;
}

// Function pointers to original calls
static int (*real_open)(const char *pathname, int flags, ...) = NULL;
static int (*real_open64)(const char *pathname, int flags, ...) = NULL;
static int (*real_ioctl)(int fd, ioctl_request_t request, ...) = NULL; // MODIFIED
static int (*real_epoll_ctl)(int epfd, int op, int fd, struct epoll_event *event) = NULL;
static int (*real_close)(int fd) = NULL;
// read is not explicitly interposed in the original, but good to have if needed for debugging
// static ssize_t (*real_read)(int fd, void *buf, size_t count) = NULL;

// Initialization function to load the real functions
__attribute__((constructor)) void init_interposer()
{
    load_real_func((void *)&real_open, "open");
    load_real_func((void *)&real_open64, "open64");
    load_real_func((void *)&real_ioctl, "ioctl");
    load_real_func((void *)&real_epoll_ctl, "epoll_ctl");
    load_real_func((void *)&real_close, "close");
    // load_real_func((void *)&real_read, "read");
}

// Type definition for correction struct (from joystick.h, often empty or unused by modern drivers)
typedef struct js_corr js_corr_t;


// Constants from Python to define js_config_t structure
#define CONTROLLER_NAME_MAX_LEN 255
#define INTERPOSER_MAX_BTNS 512
#define INTERPOSER_MAX_AXES 64

// This structure MUST match the layout and size of the data sent by the Python server.
// Python sends:
//   name (CONTROLLER_NAME_MAX_LEN chars)
//   (1 byte padding if CONTROLLER_NAME_MAX_LEN is odd, for vendor alignment)
//   vendor (uint16_t)
//   product (uint16_t)
//   version (uint16_t)
//   num_btns (uint16_t)
//   num_axes (uint16_t)
//   btn_map (INTERPOSER_MAX_BTNS uint16_t's)
//   axes_map (INTERPOSER_MAX_AXES uint8_t's)
//   final_alignment_padding (6 uint8_t's)
// Total size should be 1360 bytes with current constants.
typedef struct
{
    char name[CONTROLLER_NAME_MAX_LEN]; // Name of the controller
    // Compiler will typically add 1 byte padding here if CONTROLLER_NAME_MAX_LEN is odd (255 is odd)
    // to align 'vendor' on a 2-byte boundary.
    uint16_t vendor;       // Vendor ID
    uint16_t product;      // Product ID
    uint16_t version;      // Version number
    uint16_t num_btns;     // Actual number of buttons configured for this device
    uint16_t num_axes;     // Actual number of axes configured for this device
    uint16_t btn_map[INTERPOSER_MAX_BTNS]; // EVDEV button codes (e.g., BTN_A, BTN_B)
    uint8_t axes_map[INTERPOSER_MAX_AXES]; // EVDEV axis codes (e.g., ABS_X, ABS_Y)
    uint8_t final_alignment_padding[6];    // To match Python's explicit 6-byte padding at the end
} js_config_t;


// Struct for storing information about each interposed joystick device.
typedef struct
{
    uint8_t type; // DEV_TYPE_JS or DEV_TYPE_EV
    char open_dev_name[255];
    char socket_path[255];
    int sockfd;
    js_corr_t corr; // For JSIOCGCORR/JSIOCSCORR, typically zeroed
    js_config_t js_config; // Received from Python server
} js_interposer_t;

#define DEV_TYPE_JS 0
#define DEV_TYPE_EV 1

// Min/max values for ABS axes (can be overridden by specific axis info if needed)
#define ABS_AXIS_MIN_DEFAULT -32767
#define ABS_AXIS_MAX_DEFAULT 32767
#define ABS_TRIGGER_MIN_DEFAULT 0
#define ABS_TRIGGER_MAX_DEFAULT 255 // Common for triggers like ABS_Z/ABS_RZ
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

    // Loop to ensure all bytes of the config are read, handling partial reads
    while (bytes_read_total < bytes_to_read) {
        ssize_t current_read = read(fd, buffer_ptr + bytes_read_total, bytes_to_read - bytes_read_total);
        if (current_read == -1) {
            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                // This shouldn't happen if the socket is blocking for this initial read,
                // but handle it defensively.
                interposer_log(LOG_WARN, "read_config: read() returned EAGAIN/EWOULDBLOCK on fd %d. Retrying (this might indicate an issue).", fd);
                usleep(10000); // Sleep briefly and retry
                continue;
            }
            interposer_log(LOG_ERROR, "read_config: Failed to read config from fd %d. read() error: %s", fd, strerror(errno));
            return -1;
        } else if (current_read == 0) {
            interposer_log(LOG_ERROR, "read_config: Failed to read full config from fd %d. Reached EOF after %zd bytes (expected %zd).", fd, bytes_read_total, bytes_to_read);
            return -1; // EOF before all data was read
        }
        bytes_read_total += current_read;
    }
    
    interposer_log(LOG_INFO, "Successfully read %zd bytes for js_config_t from fd %d.", bytes_read_total, fd);
    interposer_log(LOG_INFO, "  Config Name: '%s'", config_dest->name); // Ensure name is null-terminated by Python or here
    interposer_log(LOG_INFO, "  Vendor: 0x%04x, Product: 0x%04x, Version: 0x%04x", config_dest->vendor, config_dest->product, config_dest->version);
    interposer_log(LOG_INFO, "  Num Buttons (from config): %u", config_dest->num_btns);
    interposer_log(LOG_INFO, "  Num Axes (from config): %u", config_dest->num_axes);
    // Log first few button/axis mappings for verification if needed
    if (config_dest->num_btns > 0 && INTERPOSER_MAX_BTNS > 0) {
        interposer_log(LOG_INFO, "  Btn Map [0]: 0x%04x", config_dest->btn_map[0]);
    }
    if (config_dest->num_axes > 0 && INTERPOSER_MAX_AXES > 0) {
        interposer_log(LOG_INFO, "  Axes Map [0]: 0x%02x", config_dest->axes_map[0]);
    }
    // Check if name string is properly null terminated within its buffer for safety
    if (strnlen(config_dest->name, CONTROLLER_NAME_MAX_LEN) == CONTROLLER_NAME_MAX_LEN) {
        // If strnlen reaches max without finding null, it's not null-terminated within bounds
        interposer_log(LOG_WARN, "Config name might not be null-terminated within CONTROLLER_NAME_MAX_LEN.");
        // Optionally, force null termination: config_dest->name[CONTROLLER_NAME_MAX_LEN - 1] = '\0';
        // Python side _should_ handle this.
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
    // Make socket blocking for connect and initial config read/write
    // int original_flags = fcntl(interposer->sockfd, F_GETFL, 0);
    // if (original_flags != -1) fcntl(interposer->sockfd, F_SETFL, original_flags & ~O_NONBLOCK);


    while (attempt++ < SOCKET_CONNECT_TIMEOUT_MS)
    {
        if (connect(interposer->sockfd, (struct sockaddr *)&addr, sizeof(struct sockaddr_un)) == -1)
        {
            if (errno == ENOENT || errno == ECONNREFUSED) { // Socket file doesn't exist or server not listening
                usleep(1000); // Sleep 1ms
                continue;
            }
            interposer_log(LOG_ERROR, "Failed to connect to socket %s: %s (attempt %d)", interposer->socket_path, strerror(errno), attempt);
            close(interposer->sockfd);
            interposer->sockfd = -1;
            return -1;
        }
        break; // Connected
    }
    if (interposer->sockfd == -1 || attempt >= SOCKET_CONNECT_TIMEOUT_MS) // Check sockfd in case connect never succeeded
    {
        interposer_log(LOG_ERROR, "Timed out connecting to socket %s after %d attempts.", interposer->socket_path, attempt-1);
        if(interposer->sockfd != -1) close(interposer->sockfd); // Ensure closed if loop exited due to timeout but sockfd was set
        interposer->sockfd = -1;
        return -1;
    }
    interposer_log(LOG_INFO, "Connected to socket %s (fd %d)", interposer->socket_path, interposer->sockfd);


    // Read the joystick config from the socket.
    if (read_config(interposer->sockfd, &(interposer->js_config)) != 0)
    {
        interposer_log(LOG_ERROR, "Failed to read config from socket: %s", interposer->socket_path);
        close(interposer->sockfd);
        interposer->sockfd = -1;
        return -1;
    }

    // Send architecture word length to tell client to send 64 vs 32bit wide messages.
    unsigned char arch_byte[1] = { (unsigned char)sizeof(unsigned long) };
    interposer_log(LOG_INFO, "Sending architecture specifier: %u bytes (sizeof(unsigned long))", arch_byte[0]);
    if (write(interposer->sockfd, arch_byte, sizeof(arch_byte)) != sizeof(arch_byte)) {
        interposer_log(LOG_ERROR, "Failed to send architecture specifier to %s: %s", interposer->socket_path, strerror(errno));
        close(interposer->sockfd);
        interposer->sockfd = -1;
        return -1;
    }
    interposer_log(LOG_INFO, "Successfully sent architecture specifier.");

    // Socket is initially blocking. If it needs to be non-blocking for subsequent reads,
    // it will be set by epoll_ctl or fcntl by the application.
    // Or we can set it non-blocking here if that's the desired default state after setup.
    // For now, let's make it non-blocking as applications often expect /dev/input devices to be.
    // if (make_nonblocking(interposer->sockfd) == -1) {
    //     interposer_log(LOG_WARN, "Failed to make socket %d non-blocking after setup.", interposer->sockfd);
    //     // Not necessarily fatal, application might handle blocking reads or set it itself.
    // }


    return 0; // Success
}

// Interpose epoll_ctl to make joystck socket fd non-blocking if added.
int epoll_ctl(int epfd, int op, int fd, struct epoll_event *event)
{
    if (load_real_func((void *)&real_epoll_ctl, "epoll_ctl") < 0) {
        errno = EFAULT; // Or some other suitable error
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
                    // Depending on application, this might be an issue or not.
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
                // Device already open, POSIX allows reopening, map to existing sockfd
                interposer_log(LOG_INFO, "Device %s already open with fd %d. Returning existing fd.", pathname, interposers[i].sockfd);
                *found_interposer = &interposers[i]; // Mark as found
                return interposers[i].sockfd; // Return existing fd
            }
            if (interposer_open_socket(&interposers[i]) == -1) {
                interposer_log(LOG_ERROR, "interposer_open_socket failed for %s", pathname);
                errno = EIO; // Or some other appropriate error
                return -1;   // Indicate failure
            }
            *found_interposer = &interposers[i];
            interposer_log(LOG_INFO, "Successfully interposed 'open' for %s, assigned socket fd: %d", pathname, interposers[i].sockfd);
            return interposers[i].sockfd; // Return new socket fd
        }
    }
    return -2; // Indicates not an interposed path
}

// Interposer function for open syscall
int open(const char *pathname, int flags, ...)
{
    if (load_real_func((void *)&real_open, "open") < 0) {
        errno = EFAULT; return -1;
    }

    js_interposer_t *interposer = NULL;
    int result_fd = common_open_logic(pathname, &interposer);

    if (result_fd == -2) { // Not an interposed path
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
    // If result_fd is -1 (error in common_open_logic) or a valid fd, return it.
    // errno will be set by common_open_logic on error.
    return result_fd;
}

// Interposer function for open64
int open64(const char *pathname, int flags, ...)
{
    if (load_real_func((void *)&real_open64, "open64") < 0) {
        errno = EFAULT; return -1;
    }

    js_interposer_t *interposer = NULL;
    int result_fd = common_open_logic(pathname, &interposer); // Use the same common logic

    if (result_fd == -2) { // Not an interposed path
        mode_t mode = 0;
        if (flags & O_CREAT) {
            va_list args;
            va_start(args, flags);
            mode = va_arg(args, mode_t);
            va_end(args);
            return real_open64(pathname, flags, mode);
        } else {
            return real_open64(pathname, flags);
        }
    }
    return result_fd;
}


// Interposer function for close
int close(int fd)
{
    if (load_real_func((void *)&real_close, "close") < 0) {
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
        int ret = real_close(fd); // Close the socket fd
        if (ret == 0) {
            interposer_log(LOG_INFO, "Socket fd %d closed successfully. Marking interposer slot as free.", fd);
            interposer->sockfd = -1; // Mark as closed/available
            memset(&(interposer->js_config), 0, sizeof(js_config_t)); // Clear config
        } else {
            interposer_log(LOG_ERROR, "real_close on socket fd %d failed: %s. State may be inconsistent.", fd, strerror(errno));
        }
        return ret; // Return result of closing the socket
    }

    // If not an interposed fd, just call the real close
    return real_close(fd);
}

// Handler for joystick type ioctl calls
// MODIFIED signature
int intercept_js_ioctl(js_interposer_t *interposer, int fd, ioctl_request_t request, void *arg)
{
    int len;
    uint8_t *u8_ptr;
    uint16_t *u16_ptr;

    switch (_IOC_NR(request))
    {
    case 0x01: /* JSIOCGVERSION get driver version */
        interposer_log(LOG_INFO, "IOCTL(%s): JSIOCGVERSION (0x%08lx) -> 0x%08x", interposer->open_dev_name, (unsigned long)request, JS_VERSION); // CASTED request
        if (!arg) return -EINVAL;
        *((uint32_t *)arg) = JS_VERSION;
        return 0;

    case 0x11: /* JSIOCGAXES get number of axes */
        interposer_log(LOG_INFO, "IOCTL(%s): JSIOCGAXES (0x%08lx) -> %u axes", interposer->open_dev_name, (unsigned long)request, interposer->js_config.num_axes); // CASTED request
        if (!arg) return -EINVAL;
        *((uint8_t *)arg) = interposer->js_config.num_axes;
        return 0;

    case 0x12: /* JSIOCGBUTTONS get number of buttons */
        interposer_log(LOG_INFO, "IOCTL(%s): JSIOCGBUTTONS (0x%08lx) -> %u buttons", interposer->open_dev_name, (unsigned long)request, interposer->js_config.num_btns); // CASTED request
        if (!arg) return -EINVAL;
        *((uint8_t *)arg) = interposer->js_config.num_btns;
        return 0;

    case 0x13: /* JSIOCGNAME(len) get identifier string */
        len = _IOC_SIZE(request);
        interposer_log(LOG_INFO, "IOCTL(%s): JSIOCGNAME(%d) (0x%08lx) -> '%s'", interposer->open_dev_name, len, (unsigned long)request, interposer->js_config.name); // CASTED request
        if (!arg) return -EINVAL;
        strncpy((char *)arg, interposer->js_config.name, len -1 );
        ((char *)arg)[len - 1] = '\0'; // Ensure null termination
        return strlen((char*)arg); // Historically returns strlen, not 0.

    case 0x21: /* JSIOCSCORR set correction values */
        interposer_log(LOG_INFO, "IOCTL(%s): JSIOCSCORR (0x%08lx) (noop)", interposer->open_dev_name, (unsigned long)request); // CASTED request
        if (!arg) return -EINVAL;
        memcpy(&interposer->corr, arg, sizeof(js_corr_t)); // Store if needed, though often unused
        return 0;

    case 0x22: /* JSIOCGCORR get correction values */
        interposer_log(LOG_INFO, "IOCTL(%s): JSIOCGCORR (0x%08lx)", interposer->open_dev_name, (unsigned long)request); // CASTED request
        if (!arg) return -EINVAL;
        memcpy(arg, &interposer->corr, sizeof(js_corr_t));
        return 0;

    case 0x31: /*  JSIOCSAXMAP set axis mapping */
        interposer_log(LOG_WARN, "IOCTL(%s): JSIOCSAXMAP (0x%08lx) (not supported, config from socket)", interposer->open_dev_name, (unsigned long)request); // CASTED request
        // This would overwrite config from Python, usually not desired.
        return -EPERM; // Or just 0 if we want to silently ignore

    case 0x32: /* JSIOCGAXMAP get axis mapping */
        interposer_log(LOG_INFO, "IOCTL(%s): JSIOCGAXMAP (0x%08lx) for %u axes", interposer->open_dev_name, (unsigned long)request, interposer->js_config.num_axes); // CASTED request
        if (!arg) return -EINVAL;
        u8_ptr = (uint8_t *)arg;
        // Check if the buffer provided by the application is large enough
        // _IOC_SIZE(request) should be AXES_MAX (e.g. 64 bytes for standard joystick.h JSIOCGAXMAP)
        // We copy only the *actual* number of axes. The rest of the app's buffer remains untouched or should be zeroed by app.
        if (_IOC_SIZE(request) < interposer->js_config.num_axes) return -EINVAL; // App buffer too small
        memcpy(u8_ptr, interposer->js_config.axes_map, interposer->js_config.num_axes * sizeof(uint8_t));
        return 0;

    case 0x33: /* JSIOCSBTNMAP set button mapping */
        interposer_log(LOG_WARN, "IOCTL(%s): JSIOCSBTNMAP (0x%08lx) (not supported, config from socket)", interposer->open_dev_name, (unsigned long)request); // CASTED request
        return -EPERM;

    case 0x34: /* JSIOCGBTNMAP get button mapping */
        interposer_log(LOG_INFO, "IOCTL(%s): JSIOCGBTNMAP (0x%08lx) for %u buttons", interposer->open_dev_name, (unsigned long)request, interposer->js_config.num_btns); // CASTED request
        if (!arg) return -EINVAL;
        u16_ptr = (uint16_t *)arg;
        // _IOC_SIZE(request) should be KEY_MAX * sizeof(uint16_t) (e.g. 512 * 2 = 1024 bytes for JSIOCGBTNMAP)
        if (_IOC_SIZE(request) < interposer->js_config.num_btns * sizeof(uint16_t)) return -EINVAL;
        memcpy(u16_ptr, interposer->js_config.btn_map, interposer->js_config.num_btns * sizeof(uint16_t));
        return 0;

    default:
        interposer_log(LOG_WARN, "Unhandled 'joystick' ioctl for %s: request 0x%02lx (NR=0x%02x)", interposer->open_dev_name, (unsigned long)request, _IOC_NR(request)); // CASTED request
        return -ENOTTY; // Or call real_ioctl if appropriate for some pass-through
    }
}

// Handler for event type ioctl calls
// MODIFIED signature
int intercept_ev_ioctl(js_interposer_t *interposer, int fd, ioctl_request_t request, void *arg)
{
    struct input_absinfo *absinfo;
    struct input_id *id;
    int ev_version = 0x010001; // EV_VERSION (KERNEL_VERSION(1,0,1))
    int len;
    unsigned int i;


    // EVIOCGABS(ABS_axis): Get abs value range for a specific axis
    // The request is EVIOCGABS(0) + axis_code. EVIOCGABS(0) is _IOR('E', 0x40, struct input_absinfo)
    if (_IOC_TYPE(request) == 'E' && _IOC_NR(request) >= 0x40 && _IOC_NR(request) < (0x40 + ABS_CNT)) {
        uint8_t abs_code = _IOC_NR(request) - 0x40;
        absinfo = (struct input_absinfo *)arg;
        if (!absinfo) return -EINVAL;

        // Default values, can be customized per axis if needed
        absinfo->value = 0; // Current value (usually 0 at init)
        absinfo->minimum = ABS_AXIS_MIN_DEFAULT;
        absinfo->maximum = ABS_AXIS_MAX_DEFAULT;
        absinfo->fuzz = 16;    // Example values
        absinfo->flat = 128;   // Example values
        absinfo->resolution = 0; // Not always set

        // Specific overrides based on common axis types
        if (abs_code == ABS_Z || abs_code == ABS_RZ || /* other triggers */
            abs_code == ABS_THROTTLE || abs_code == ABS_RUDDER ||
            abs_code == ABS_WHEEL || abs_code == ABS_GAS || abs_code == ABS_BRAKE) {
            absinfo->minimum = ABS_TRIGGER_MIN_DEFAULT;
            absinfo->maximum = ABS_TRIGGER_MAX_DEFAULT;
            // Fuzz/flat might be smaller for triggers
            absinfo->fuzz = 0;
            absinfo->flat = 0;
        } else if (abs_code >= ABS_HAT0X && abs_code <= ABS_HAT3Y) {
            absinfo->minimum = ABS_HAT_MIN_DEFAULT;
            absinfo->maximum = ABS_HAT_MAX_DEFAULT;
            absinfo->fuzz = 0;
            absinfo->flat = 0;
        }
        // Check if this abs_code is actually in our axes_map
        int found_axis = 0;
        for(i=0; i < interposer->js_config.num_axes; ++i) {
            if (interposer->js_config.axes_map[i] == abs_code) {
                found_axis = 1;
                break;
            }
        }
        if(!found_axis) {
             // If the game is querying an axis we don't claim to support via EVIOCGBIT(EV_ABS),
             // it might be an error to return success, or we can return zeroed struct.
             // For now, let's return EINVAL if not in our map.
             // interposer_log(LOG_WARN, "IOCTL(%s): EVIOCGABS for unmapped axis 0x%02x", interposer->open_dev_name, abs_code);
             // return -EINVAL; // Or provide defaults as above. Let's provide defaults for now.
        }

        interposer_log(LOG_INFO, "IOCTL(%s): EVIOCGABS(0x%02x) (0x%08lx) min:%d max:%d", interposer->open_dev_name, abs_code, (unsigned long)request, absinfo->minimum, absinfo->maximum); // CASTED request
        return 0; // Success
    }


    switch (request) // Using full request value for some EVIOC* macros
    {
    // EVIOCGVERSION: Get device version.
    case EVIOCGVERSION:
        interposer_log(LOG_INFO, "IOCTL(%s): EVIOCGVERSION (0x%08lx) -> 0x%08x", interposer->open_dev_name, (unsigned long)request, ev_version); // CASTED request
        if (!arg) return -EINVAL;
        *((int *)arg) = ev_version;
        return 0;

    // EVIOCGID: Get device ID (bustype, vendor, product, version).
    case EVIOCGID:
        id = (struct input_id *)arg;
        if (!id) return -EINVAL;
        memset(id, 0, sizeof(struct input_id));
        id->bustype = BUS_VIRTUAL; // Or BUS_USB if emulating USB more closely
        id->vendor = interposer->js_config.vendor;
        id->product = interposer->js_config.product;
        id->version = interposer->js_config.version;
        interposer_log(LOG_INFO, "IOCTL(%s): EVIOCGID (0x%08lx) -> bus:0x%04x, ven:0x%04x, prod:0x%04x, ver:0x%04x",
                       interposer->open_dev_name, (unsigned long)request, id->bustype, id->vendor, id->product, id->version); // CASTED request
        return 0;

    // EVIOCGNAME(len): Get device name.
    //case EVIOCGNAME(0): // This is tricky, EVIOCGNAME has length embedded. Check _IOC_NR for base.
        if (_IOC_TYPE(request) == 'E' && _IOC_NR(request) == 0x06) { // EVIOCGNAME base
            len = _IOC_SIZE(request);
            interposer_log(LOG_INFO, "IOCTL(%s): EVIOCGNAME(%u) (0x%08lx) for name '%s'", interposer->open_dev_name, (unsigned int)len, (unsigned long)request, interposer->js_config.name); // CASTED request
            if (!arg) {
                interposer_log(LOG_WARN, "IOCTL(%s): EVIOCGNAME called with NULL argument.", interposer->open_dev_name);
                return -EINVAL;
            }

            if (len == 0) {
                // If the caller provides a buffer of size 0, we can't write anything.
                // The ioctl should return the length of the string. If no space, length copied is 0.
                interposer_log(LOG_INFO, "IOCTL(%s): EVIOCGNAME with len 0. Returning 0.", interposer->open_dev_name);
                return 0;
            }
            
            // len is > 0.
            // Copy at most (len-1) characters to leave space for our explicit null terminator.
            strncpy((char *)arg, interposer->js_config.name, len - 1);
            // Ensure null termination at the end of the provided buffer.
            ((char *)arg)[len - 1] = '\0';
            
            // Return the length of the (possibly truncated) string now in arg.
            return strlen((char *)arg);
        }

    // EVIOCGBIT(ev_type, len): Get event type capabilities.
    // EVIOCGBIT(0, len) is for EV_SYN, EV_KEY, etc. (the event types themselves)
    // EVIOCGBIT(EV_KEY, len) is for specific key codes supported.
    // EVIOCGBIT(EV_ABS, len) is for specific abs axes codes supported.
    // This needs to be handled more generally.
    // The request is EVIOCGBIT(event_type_code, length_of_bitmap)
    // EVIOCGBIT(0, EV_MAX/8 + 1) -> get map of supported event types (EV_SYN, EV_KEY, EV_ABS etc)
    // EVIOCGBIT(EV_KEY, KEY_MAX/8 + 1) -> get map of supported keys
    // EVIOCGBIT(EV_ABS, ABS_MAX/8 + 1) -> get map of supported abs axes
    // The first argument to EVIOCGBIT macro is the event type (0 for general types, EV_KEY for keys, etc.)
    // The second argument to EVIOCGBIT macro is the length of the buffer.
    // The actual value of request is constructed using _IOR('E', 0x20 + ev_type, char[len])

    // EVIOCGPROP(len): Get device properties.
    case EVIOCGPROP(0): // This check might be problematic if EVIOCGPROP(0) is not how it's typically used/defined.
                        // Better to check _IOC_TYPE and _IOC_NR.
        if (_IOC_TYPE(request) == 'E' && _IOC_NR(request) == 0x09) { // EVIOCGPROP base
            len = _IOC_SIZE(request);
            interposer_log(LOG_INFO, "IOCTL(%s): EVIOCGPROP(%d) (0x%08lx) (returning 0 props)", interposer->open_dev_name, len, (unsigned long)request); // CASTED request
            if (!arg) return -EINVAL;
            if (len > 0) memset(arg, 0, len); // No specific properties claimed by default
            return 0; // Number of bytes written (0 for no props)
        }
        break;

    // EVIOCGKEY(len): Get current key state.
    case EVIOCGKEY(0): // Similar to EVIOCGPROP, better to check _IOC_TYPE and _IOC_NR.
         if (_IOC_TYPE(request) == 'E' && _IOC_NR(request) == 0x18) { // EVIOCGKEY base
            len = _IOC_SIZE(request);
            interposer_log(LOG_INFO, "IOCTL(%s): EVIOCGKEY(%d) (0x%08lx) (returning all keys up)", interposer->open_dev_name, len, (unsigned long)request); // CASTED request
            if (!arg) return -EINVAL;
            if (len > 0) memset(arg, 0, len); // Report all keys as up
            return 0; // Success
        }
        break;

    // EVIOCGRAB: Grab/ungrab device.
    case EVIOCGRAB:
        interposer_log(LOG_INFO, "IOCTL(%s): EVIOCGRAB (0x%08lx) (arg: %p, val: %d) (noop, success)",
                       interposer->open_dev_name, (unsigned long)request, arg, arg ? *((int*)arg) : -1); // CASTED request
        // For a virtual device, "grabbing" might not make sense or could be a no-op.
        // If arg is non-zero, it means grab. If zero, release.
        // We just return success.
        return 0;

    // EVIOCRMFF(id): Remove a force feedback effect.
    // EVIOCSFF(effect): Upload a force feedback effect.
    // These are more complex and often not needed for basic gamepad.
    // If _IOC_NR is 0x81 (for EVIOCRMFF) or 0x80 (for EVIOCSFF)
    // No-op for now.
    }


    // General EVIOCGBIT handling (put after specific full request matches)
    if (_IOC_TYPE(request) == 'E' && _IOC_NR(request) >= 0x20 && _IOC_NR(request) < 0x40) {
        unsigned char ev_type_query = _IOC_NR(request) - 0x20;
        len = _IOC_SIZE(request);
        if (!arg) return -EINVAL;
        memset(arg, 0, len); // Clear the buffer first

        interposer_log(LOG_INFO, "IOCTL(%s): EVIOCGBIT for EV type 0x%02x, len %d (0x%08lx)",
                       interposer->open_dev_name, ev_type_query, len, (unsigned long)request); // CASTED request

        if (ev_type_query == 0) { // Query for supported event types (EV_SYN, EV_KEY, EV_ABS, etc.)
            // We support SYN, KEY, ABS. Maybe MSC for EV_MSC / MSC_SCAN.
            if (EV_SYN < len * 8) ((unsigned char *)arg)[EV_SYN / 8] |= (1 << (EV_SYN % 8));
            if (EV_KEY < len * 8) ((unsigned char *)arg)[EV_KEY / 8] |= (1 << (EV_KEY % 8));
            if (EV_ABS < len * 8) ((unsigned char *)arg)[EV_ABS / 8] |= (1 << (EV_ABS % 8));
            // if (EV_MSC < len * 8) ((unsigned char *)arg)[EV_MSC / 8] |= (1 << (EV_MSC % 8));
            // if (EV_FF < len * 8) { /* if we support FF */ }
            return len; // Return number of bytes written (standard says bytes, some impls return bits)
        }
        else if (ev_type_query == EV_KEY) { // Query for supported key codes
            for (i = 0; i < interposer->js_config.num_btns; ++i) {
                int key_code = interposer->js_config.btn_map[i];
                if (key_code >= 0 && key_code < KEY_MAX && key_code < len * 8) { // Check if key_code fits in the provided buffer and is valid
                    ((unsigned char *)arg)[key_code / 8] |= (1 << (key_code % 8));
                }
            }
            return len;
        }
        else if (ev_type_query == EV_ABS) { // Query for supported absolute axis codes
            for (i = 0; i < interposer->js_config.num_axes; ++i) {
                int abs_code = interposer->js_config.axes_map[i];
                 if (abs_code >= 0 && abs_code < ABS_MAX && abs_code < len * 8) { // Check if abs_code fits and is valid
                    ((unsigned char *)arg)[abs_code / 8] |= (1 << (abs_code % 8));
                }
            }
            return len;
        }
        // Other types like EV_REL, EV_MSC, EV_LED, EV_SND, EV_FF could be handled here if supported.
        // For now, they will return an empty bitmask.
        return len; // Or 0 if we didn't set any bits for this ev_type_query
    }


    interposer_log(LOG_WARN, "Unhandled EVDEV ioctl for %s: request 0x%08lx (Type 'E', NR 0x%02x)",
                   interposer->open_dev_name, (unsigned long)request, _IOC_NR(request)); // CASTED request
    return -ENOTTY; // Standard response for unsupported ioctl
}


// Interposer function for ioctl syscall
// MODIFIED signature
int ioctl(int fd, ioctl_request_t request, ...)
{
    if (load_real_func((void *)&real_ioctl, "ioctl") < 0) {
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
        // Pass through to real_ioctl, request is already ioctl_request_t
        return real_ioctl(fd, request, arg_ptr);
    }

    // Check interposer type and dispatch
    if (interposer->type == DEV_TYPE_JS && _IOC_TYPE(request) == 'j')
    {
        return intercept_js_ioctl(interposer, fd, request, arg_ptr);
    }
    else if (interposer->type == DEV_TYPE_EV && _IOC_TYPE(request) == 'E')
    {
        return intercept_ev_ioctl(interposer, fd, request, arg_ptr);
    }
    else if (interposer->type == DEV_TYPE_EV && _IOC_TYPE(request) == 'H') { // For UHID /dev/hidraw* specific ioctls
        interposer_log(LOG_WARN, "IOCTL(%s): HID ioctl 0x%lx received but not handled (pass to real_ioctl)", interposer->open_dev_name, (unsigned long)request); // CASTED request
        // HID ioctls are complex, pass through if this were a hidraw device.
        // But we are emulating /dev/input/event*, so this shouldn't happen.
        // If it does, it implies application misidentified the device.
        return -ENOTTY;
    }
    else if (_IOC_TYPE(request) == 'f') { // fcntl commands like FIONREAD (TIOCINQ alias)
        if (request == FIONREAD) { // Get number of bytes available to read
            // This is tricky for a socket. If it's non-blocking, this should reflect readable bytes.
            // For a virtual device, this could be complex.
            // Let's return 0 if no events are pending from Python side, or size of next event.
            // Simplest for now:
            interposer_log(LOG_INFO, "IOCTL(%s): FIONREAD (0x%08lx). (Returning 0, needs proper implementation if app relies on it)",
                           interposer->open_dev_name, (unsigned long)request); // CASTED request
            if (!arg_ptr) return -EINVAL;
            *(int*)arg_ptr = 0; // TODO: implement properly if needed by checking socket buffer
            return 0;
        }
    }


    interposer_log(LOG_WARN, "IOCTL(%s): Mismatched ioctl type 0x%x for device type %d, or unhandled ioctl 0x%08lx. Passing to real_ioctl.",
                   interposer->open_dev_name, _IOC_TYPE(request), interposer->type, (unsigned long)request); // CASTED request
    // If ioctl type doesn't match device type, or it's an unhandled one,
    // it's unlikely real_ioctl on a socket fd will do anything useful for device ioctls.
    // But for generic fd ioctls (like FIONBIO), it might.
    // However, device-specific ioctls on a plain socket fd will likely fail with ENOTTY.
    return real_ioctl(fd, request, arg_ptr); // This will likely return -ENOTTY for device-specific ioctls
}
