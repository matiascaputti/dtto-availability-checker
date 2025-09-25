const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");
require("dotenv").config();

class CourtAvailabilityChecker {
  constructor() {
    this.apiUrl =
      "https://alquilatucancha.com/api/v3/availability/sportclubs/1003";
    this.telegramBot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
    this.chatId = process.env.TELEGRAM_CHAT_ID;
    this.startTime = process.env.START_TIME || "16:30";
    this.endTime = process.env.END_TIME || "20:00";
    this.intervalMinutes = parseInt(process.env.INTERVAL_MINUTES) || 1;
    this.notifiedSlots = new Set(); // Track already notified slots
    this.intervalId = null;
    this.heartbeatIntervalId = null; // For hourly heartbeat
    this.timezone = "America/Argentina/Buenos_Aires"; // GMT-3
    this.currentMonitoringDate = this.getNextDate(); // Track current monitoring date (next day)
    this.lastNewDayCheck = this.getCurrentTimeInTimezone().toDateString(); // Track when we last checked for new day
  }

  /**
   * Get current time in the specified timezone
   */
  getCurrentTimeInTimezone() {
    return new Date(
      new Date().toLocaleString("en-US", { timeZone: this.timezone })
    );
  }

  /**
   * Get current date in YYYY-MM-DD format in timezone
   */
  getCurrentDate() {
    const today = this.getCurrentTimeInTimezone();
    return today.toISOString().split("T")[0];
  }

  /**
   * Get next day date in YYYY-MM-DD format in timezone
   */
  getNextDate() {
    const today = this.getCurrentTimeInTimezone();
    const nextDay = new Date(today);
    nextDay.setDate(today.getDate() + 1);
    return nextDay.toISOString().split("T")[0];
  }

  /**
   * Check if a new day has started (00:00 in timezone) and handle the transition
   */
  async handleDayChange() {
    const currentTimeInTz = this.getCurrentTimeInTimezone();
    const currentDateString = currentTimeInTz.toDateString();

    // Check if we've moved to a new day (00:00 has passed)
    if (currentDateString !== this.lastNewDayCheck) {
      const newMonitoringDate = this.getNextDate();

      console.log(
        `Day changed from monitoring ${this.currentMonitoringDate} to ${newMonitoringDate}`
      );

      this.currentMonitoringDate = newMonitoringDate;
      this.lastNewDayCheck = currentDateString;

      // Reset notified slots for the new day
      this.notifiedSlots.clear();

      // Send notification about new day monitoring
      const newDayMessage = `🌅 New day started! Now monitoring court availability for ${newMonitoringDate} (tomorrow)`;
      try {
        await this.sendTelegramMessage(newDayMessage);
      } catch (error) {
        console.error("Failed to send new day notification:", error.message);
      }

      return true; // Day changed
    }

    return false; // Same day
  }

  /**
   * Convert time string (HH:MM) to minutes for easy comparison
   */
  timeToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(":").map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Check if a time slot is within the desired range
   */
  isTimeInRange(timeStr) {
    const timeMinutes = this.timeToMinutes(timeStr);
    const startMinutes = this.timeToMinutes(this.startTime);
    const endMinutes = this.timeToMinutes(this.endTime);

    return timeMinutes >= startMinutes && timeMinutes <= endMinutes;
  }

  /**
   * Fetch availability data from the API
   */
  async fetchAvailability() {
    try {
      // Use the monitoring date (which is the next day)
      const url = `${this.apiUrl}?date=${this.currentMonitoringDate}`;
      const response = await axios.get(url);
      return response.data;
    } catch (error) {
      console.error("Error fetching availability:", error.message);
      throw error;
    }
  }

  /**
   * Filter available slots within the time range for each court
   */
  filterAvailableSlots(data) {
    const availableSlots = [];

    // The API response structure may vary, so we'll handle common formats
    let courts = [];

    if (data.courts) {
      courts = data.courts;
    } else if (data.data && data.data.courts) {
      courts = data.data.courts;
    } else if (Array.isArray(data)) {
      courts = data;
    } else if (data.availability) {
      courts = data.availability;
    }

    courts.forEach((court) => {
      const courtName =
        court.name || court.court_name || court.title || `Court ${court.id}`;

      // Look for slots in various possible structures
      let slots = court.slots || court.availability || court.times || [];

      if (court.schedule) {
        slots = court.schedule;
      }

      slots.forEach((slot) => {
        // Check if slot is available
        const isAvailable =
          slot.available === true ||
          slot.status === "available" ||
          slot.state === "available" ||
          !slot.occupied ||
          !slot.booked;

        if (isAvailable) {
          const startTime = slot.start || slot.time || slot.start_time;

          if (startTime && this.isTimeInRange(startTime)) {
            availableSlots.push({
              court: courtName,
              time: startTime,
              slot: slot,
            });
          }
        }
      });
    });

    return availableSlots;
  }

  /**
   * Send Telegram message
   */
  async sendTelegramMessage(message) {
    try {
      await this.telegramBot.sendMessage(this.chatId, message);
    } catch (error) {
      console.error("Error sending Telegram message:", error.message);
      throw error;
    }
  }

  /**
   * Create a unique identifier for a slot
   */
  getSlotId(slot) {
    return `${slot.court}-${slot.time}`;
  }

  /**
   * Format and send notifications for available slots
   */
  async sendNotifications(availableSlots, isFirstRun = false) {
    // Filter out already notified slots (only for subsequent runs)
    const newSlots = isFirstRun
      ? availableSlots
      : availableSlots.filter(
          (slot) => !this.notifiedSlots.has(this.getSlotId(slot))
        );

    if (availableSlots.length === 0) {
      if (isFirstRun) {
        const message = `No hay turnos disponibles entre ${this.startTime} y ${this.endTime} para mañana (${this.currentMonitoringDate}).`;
        await this.sendTelegramMessage(message);
      }
      return;
    }

    if (newSlots.length === 0 && !isFirstRun) {
      console.log("No new slots to notify");
      return;
    }

    // Send individual messages for each new available slot
    for (const slot of newSlots) {
      const slotId = this.getSlotId(slot);
      const message = `🎾 Turno disponible mañana (${this.currentMonitoringDate}) a las ${slot.time}hs en cancha ${slot.court}`;
      await this.sendTelegramMessage(message);

      // Mark slot as notified
      this.notifiedSlots.add(slotId);

      // Add small delay between messages to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Clean up notified slots that are no longer available
    const currentSlotIds = new Set(
      availableSlots.map((slot) => this.getSlotId(slot))
    );
    this.notifiedSlots = new Set(
      [...this.notifiedSlots].filter((slotId) => currentSlotIds.has(slotId))
    );
  }

  /**
   * Single availability check
   */
  async checkAvailability(isFirstRun = false) {
    try {
      // Check if day has changed (except on first run)
      if (!isFirstRun) {
        const dayChanged = await this.handleDayChange();
        if (dayChanged) {
          // If day changed, treat this as a first run for the new day
          isFirstRun = true;
        }
      }

      const currentTime = new Date().toLocaleTimeString();
      // console.log(`[${currentTime}] Checking court availability...`);

      // Fetch availability data
      const data = await this.fetchAvailability();

      // Filter available slots
      const availableSlots = this.filterAvailableSlots(data);
      // console.log(
      //   `Found ${availableSlots.length} available slots in time range`
      // );

      // Send notifications
      await this.sendNotifications(availableSlots, isFirstRun);
    } catch (error) {
      console.error("Error in court availability check:", error.message);

      // Try to send error notification
      try {
        const errorMessage = `❌ Error checking court availability: ${error.message}`;
        await this.sendTelegramMessage(errorMessage);
      } catch (telegramError) {
        console.error(
          "Failed to send error notification via Telegram:",
          telegramError.message
        );
      }
    }
  }

  /**
   * Send hourly heartbeat message
   */
  async sendHeartbeat() {
    try {
      const currentTime = this.getCurrentTimeInTimezone();
      const timeString = currentTime.toLocaleTimeString("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: this.timezone,
      });
      const heartbeatMessage = `💓 Bot is running - ${timeString} GMT-3 | Monitoring: ${this.currentMonitoringDate}`;
      await this.sendTelegramMessage(heartbeatMessage);
      console.log(`Heartbeat sent at ${timeString}`);
    } catch (error) {
      console.error("Failed to send heartbeat:", error.message);
    }
  }

  /**
   * Start continuous monitoring
   */
  async startMonitoring() {
    console.log("Starting continuous court availability monitoring...");
    console.log(`Time range: ${this.startTime} - ${this.endTime}`);
    console.log(`Check interval: ${this.intervalMinutes} minute(s)`);
    console.log(`Monitoring date: ${this.currentMonitoringDate} (tomorrow)`);
    console.log(`Timezone: ${this.timezone}`);

    // Validate environment variables
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      throw new Error("TELEGRAM_BOT_TOKEN environment variable is required");
    }

    if (!process.env.TELEGRAM_CHAT_ID) {
      throw new Error("TELEGRAM_CHAT_ID environment variable is required");
    }

    // Send startup notification
    const startupMessage = `🚀 Court availability monitoring started!\n⏰ Checking every ${this.intervalMinutes} minute(s) between ${this.startTime} and ${this.endTime}\n📅 Monitoring for: ${this.currentMonitoringDate} (tomorrow)\n🌍 Timezone: GMT-3`;
    await this.sendTelegramMessage(startupMessage);

    // Perform initial check
    await this.checkAvailability(true);

    // Set up interval for continuous checking
    this.intervalId = setInterval(async () => {
      await this.checkAvailability(false);
    }, this.intervalMinutes * 60 * 1000);

    // Set up hourly heartbeat (every 60 minutes)
    this.heartbeatIntervalId = setInterval(async () => {
      await this.sendHeartbeat();
    }, 60 * 60 * 1000); // 1 hour in milliseconds

    // Send initial heartbeat
    await this.sendHeartbeat();
  }

  /**
   * Stop monitoring
   */
  async stopMonitoring() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("Monitoring stopped");
    }

    if (this.heartbeatIntervalId) {
      clearInterval(this.heartbeatIntervalId);
      this.heartbeatIntervalId = null;
      console.log("Heartbeat stopped");
    }

    try {
      const stopMessage = "🛑 Court availability monitoring stopped.";
      await this.sendTelegramMessage(stopMessage);
    } catch (error) {
      console.error("Failed to send stop notification:", error.message);
    }
  }

  /**
   * Main execution method
   */
  async run() {
    try {
      await this.startMonitoring();
    } catch (error) {
      console.error("Error starting monitoring:", error.message);
      process.exit(1);
    }
  }
}

// Run the application
if (require.main === module) {
  const checker = new CourtAvailabilityChecker();

  // Graceful shutdown handling
  const gracefulShutdown = async (signal) => {
    console.log(`\nReceived ${signal}. Shutting down gracefully...`);
    await checker.stopMonitoring();
    process.exit(0);
  };

  // Handle various termination signals
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGUSR2", () => gracefulShutdown("SIGUSR2")); // For nodemon

  // Handle uncaught exceptions
  process.on("uncaughtException", async (error) => {
    console.error("Uncaught Exception:", error);
    await checker.stopMonitoring();
    process.exit(1);
  });

  process.on("unhandledRejection", async (reason, promise) => {
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
    await checker.stopMonitoring();
    process.exit(1);
  });

  checker.run();
}

module.exports = CourtAvailabilityChecker;
