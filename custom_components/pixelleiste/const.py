"""Constants for the PixelLeiste integration."""

DOMAIN = "pixelleiste"
MANUFACTURER = "iPixel Color"

CONF_PASSWORD = "password"
CONF_IDLE_SECONDS = "idle_seconds"
DEFAULT_IDLE_SECONDS = 30

# Text entity settings (select / number entities feed these)
EFFECTS = {
    "static": 0,
    "scroll_left": 1,
    "scroll_right": 2,
    "blink": 5,
    "fade": 6,
    "snowflake": 7,
}
COLORS = {
    "white": "ffffff",
    "red": "ff2a1a",
    "orange": "ff8c00",
    "yellow": "ffd60a",
    "green": "34c759",
    "cyan": "00e5ff",
    "blue": "0a84ff",
    "magenta": "ff2d92",
    "rainbow": "ffffff",
}
CLOCK_STYLES = [str(i) for i in range(1, 10)]
SLOTS = [str(i) for i in range(1, 11)]

SERVICE_SEND_TEXT = "send_text"
SERVICE_SEND_IMAGE = "send_image"
SERVICE_SHOW_CLOCK = "show_clock"
SERVICE_SHOW_SLOT = "show_slot"
SERVICE_DELETE_SLOT = "delete_slot"
SERVICE_SCOREBOARD = "scoreboard"
SERVICE_COUNTDOWN = "countdown"
SERVICE_STOPWATCH = "stopwatch"
SERVICE_RHYTHM = "rhythm"
SERVICE_ORIENTATION = "set_orientation"
