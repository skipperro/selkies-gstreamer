TARGET_SO = libudev.so.1
TARGET_BASENAME = libudev.so
LIB_VERSION = 1.0.0-fake # Doesn't really matter for LD_PRELOAD
FULL_TARGET = $(TARGET_BASENAME).$(LIB_VERSION)
CC = gcc
CFLAGS = -Wall -Wextra -fPIC -DPIC -O2 -g
LDFLAGS = -shared
LDFLAGS += -Wl,--version-script=libudev.sym
LDFLAGS += -Wl,-soname,$(TARGET_SO)
SOURCES = fake-libudev-core.c
OBJECTS = $(SOURCES:.c=.o)
all: $(FULL_TARGET) $(TARGET_SO) $(TARGET_BASENAME)
$(FULL_TARGET): $(OBJECTS) libudev.h libudev.sym
	$(CC) $(LDFLAGS) -o $@ $(OBJECTS)
	@echo "Built $@"
$(TARGET_SO): $(FULL_TARGET)
	@echo "Creating SONAME symlink $(TARGET_SO) -> $(FULL_TARGET)"
	@ln -sf $(FULL_TARGET) $(TARGET_SO)
$(TARGET_BASENAME): $(TARGET_SO)
	@echo "Creating symlink $(TARGET_BASENAME) -> $(TARGET_SO)"
	@ln -sf $(TARGET_SO) $(TARGET_BASENAME)
%.o: %.c libudev.h
	$(CC) $(CFLAGS) -c -o $@ $<
clean:
	rm -f $(OBJECTS) $(FULL_TARGET) $(TARGET_SO) $(TARGET_BASENAME) core.* *.core
.PHONY: all clean
