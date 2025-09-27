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
    this.shiftDays = parseInt(process.env.SHIFT_DAYS) || 0;
    this.notifiedSlots = new Set(); // Track already notified slots
    this.intervalId = null;
    this.timezone = "America/Argentina/Buenos_Aires"; // GMT-3
    this.currentMonitoringDate = this.getTargetDate(); // Track current monitoring date
    this.lastNewDayCheck = this.getCurrentTimeInTimezone().toDateString(); // Track when we last checked for new day
  }

  /**
   * Get current time in Argentina timezone (GMT-3)
   */
  getCurrentTimeInTimezone() {
    const now = new Date();
    return new Date(now.toLocaleString("en-US", { timeZone: this.timezone }));
  }

  /**
   * Get target date based on SHIFT_DAYS in YYYY-MM-DD format in Argentina timezone
   */
  getTargetDate() {
    const today = this.getCurrentTimeInTimezone();
    const targetDay = new Date(today);
    targetDay.setDate(today.getDate() + this.shiftDays);
    return targetDay.toISOString().split("T")[0];
  }

  /**
   * Get next day after target date in YYYY-MM-DD format in Argentina timezone
   */
  getNextDayDate() {
    const today = this.getCurrentTimeInTimezone();
    const nextDay = new Date(today);
    nextDay.setDate(today.getDate() + this.shiftDays + 1);
    return nextDay.toISOString().split("T")[0];
  }

  /**
   * Get human-readable description for a day based on shift from today
   */
  getDayDescription(shiftDays) {
    switch (shiftDays) {
      case 0:
        return "hoy";
      case 1:
        return "mañana";
      case 2:
        return "pasado mañana";
      default:
        return shiftDays > 0
          ? `en ${shiftDays} días`
          : `hace ${Math.abs(shiftDays)} días`;
    }
  }

  /**
   * Check if a new day has started (00:00 in timezone) and handle the transition
   */
  async handleDayChange() {
    const currentTimeInTz = this.getCurrentTimeInTimezone();
    const currentDateString = currentTimeInTz.toDateString();

    // Check if we've moved to a new day (00:00 has passed)
    if (currentDateString !== this.lastNewDayCheck) {
      const newMonitoringDate = this.getTargetDate();

      console.log(
        `Day changed from monitoring ${this.currentMonitoringDate} to ${newMonitoringDate}`
      );

      this.currentMonitoringDate = newMonitoringDate;
      this.lastNewDayCheck = currentDateString;

      // Reset notified slots for the new day
      this.notifiedSlots.clear();

      // Send notification about new day monitoring
      const targetDayDescription = this.getDayDescription(this.shiftDays);
      const newDayMessage = `🌅 New day started! Now monitoring court availability for ${newMonitoringDate} (${targetDayDescription})`;
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
   * Fetch availability data from the API for a specific date
   */
  async fetchAvailabilityForDate(date) {
    try {
      const url = `${this.apiUrl}?date=${date}`;
      const response = await axios.get(url);
      return response.data;
    } catch (error) {
      console.error(`Error fetching availability for ${date}:`, error.message);
      throw error;
    }
  }

  /**
   * Fetch availability data for both target day and next day
   */
  async fetchAvailability() {
    try {
      const targetDate = this.currentMonitoringDate;
      const nextDate = this.getNextDayDate();

      const [targetData, nextData] = await Promise.all([
        this.fetchAvailabilityForDate(targetDate),
        this.fetchAvailabilityForDate(nextDate),
      ]);

      return {
        targetDay: { date: targetDate, data: targetData },
        nextDay: { date: nextDate, data: nextData },
      };
    } catch (error) {
      console.error("Error fetching availability:", error.message);
      throw error;
    }
  }

  /**
   * Filter available slots within the time range for each court
   */
  filterAvailableSlots(data, date, dayDescription) {
    const availableSlots = [];

    // Check if we have the correct API response structure
    if (!data.available_courts || !Array.isArray(data.available_courts)) {
      console.error(
        `Invalid API response structure for ${date} - missing available_courts`
      );
      return availableSlots;
    }

    data.available_courts.forEach((court) => {
      const courtName = court.name || `Court ${court.id}`;

      if (!court.available_slots || !Array.isArray(court.available_slots)) {
        return;
      }

      court.available_slots.forEach((slot) => {
        const startDateTime = slot.start;

        if (startDateTime) {
          const timeMatch = startDateTime.match(/T(\d{2}:\d{2})/);
          if (timeMatch) {
            const timeOnly = timeMatch[1];

            if (this.isTimeInRange(timeOnly)) {
              const priceFormatted = slot.price
                ? `$${(slot.price.cents / 100).toLocaleString("es-AR")}`
                : "Price not available";

              availableSlots.push({
                court: courtName,
                time: timeOnly,
                fullDateTime: startDateTime,
                duration: slot.duration,
                price: priceFormatted,
                priceRaw: slot.price,
                date: date,
                dayDescription: dayDescription,
                slot: slot,
              });
            }
          }
        }
      });
    });

    return availableSlots;
  }

  /**
   * Process availability data for both days
   */
  processAvailabilityData(availabilityData) {
    const targetSlots = this.filterAvailableSlots(
      availabilityData.targetDay.data,
      availabilityData.targetDay.date,
      this.getDayDescription(this.shiftDays)
    );

    const nextSlots = this.filterAvailableSlots(
      availabilityData.nextDay.data,
      availabilityData.nextDay.date,
      this.getDayDescription(this.shiftDays + 1)
    );

    return [...targetSlots, ...nextSlots];
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
    return `${slot.date}-${slot.court}-${slot.time}`;
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
        const targetDayDescription = this.getDayDescription(this.shiftDays);
        const nextDayDescription = this.getDayDescription(this.shiftDays + 1);
        const nextDate = this.getNextDayDate();
        const message = `No hay turnos disponibles entre ${this.startTime} y ${this.endTime} para:\n• ${targetDayDescription} (${this.currentMonitoringDate})\n• ${nextDayDescription} (${nextDate})`;
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
      const durationText = slot.duration
        ? `${slot.duration} minutos`
        : "90 minutos";
      const message = `🎾 Turno disponible ${slot.dayDescription} (${slot.date}) a las ${slot.time}hs en ${slot.court}\n💰 Precio: ${slot.price}\n⏱️ Duración: ${durationText}`;
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

      // Fetch availability data for both days
      const availabilityData = await this.fetchAvailability();

      // Process and filter available slots for both days
      const availableSlots = this.processAvailabilityData(availabilityData);

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
   * Start continuous monitoring
   */
  async startMonitoring() {
    const nextDate = this.getNextDayDate();
    const startupMessage = `🚀 Starting court availability monitoring
📅 Monitoring: ${this.currentMonitoringDate} (${this.getDayDescription(
      this.shiftDays
    )}) + ${nextDate} (${this.getDayDescription(this.shiftDays + 1)})
⏰ Time: ${this.startTime}-${this.endTime} | Check every ${
      this.intervalMinutes
    }min`;
    console.log(startupMessage);

    // Validate environment variables
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      throw new Error("TELEGRAM_BOT_TOKEN environment variable is required");
    }

    if (!process.env.TELEGRAM_CHAT_ID) {
      throw new Error("TELEGRAM_CHAT_ID environment variable is required");
    }

    // Send startup notification
    const telegramStartupMessage = `🚀 Court availability monitoring started!
⏰ Checking every ${this.intervalMinutes} minute(s) between ${
      this.startTime
    } and ${this.endTime}
📅 Monitoring both:
• ${this.currentMonitoringDate} (${this.getDayDescription(this.shiftDays)})
• ${nextDate} (${this.getDayDescription(this.shiftDays + 1)})`;
    await this.sendTelegramMessage(telegramStartupMessage);

    // Perform initial check
    await this.checkAvailability(true);

    // Set up interval for continuous checking
    this.intervalId = setInterval(async () => {
      await this.checkAvailability(false);
    }, this.intervalMinutes * 60 * 1000);
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
