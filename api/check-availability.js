const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");

class CourtAvailabilityChecker {
  constructor() {
    this.apiUrl =
      "https://alquilatucancha.com/api/v3/availability/sportclubs/1003";
    this.telegramBot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
    this.chatId = process.env.TELEGRAM_CHAT_ID;
    this.startTime = process.env.START_TIME || "16:30";
    this.endTime = process.env.END_TIME || "20:00";
  }

  /**
   * Get current date in YYYY-MM-DD format
   */
  getCurrentDate() {
    const today = new Date();
    return today.toISOString().split("T")[0];
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
      const currentDate = this.getCurrentDate();
      const url = `${this.apiUrl}?date=${currentDate}`;
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
   * Get cached notified slots from storage (Vercel KV or environment)
   * In a real deployment, you'd want to use Vercel KV or a database
   */
  async getNotifiedSlots() {
    // For now, we'll use a simple approach: check all slots every time
    // In production, you'd want to implement proper storage
    return new Set();
  }

  /**
   * Save notified slots to storage
   */
  async saveNotifiedSlots(notifiedSlots) {
    // For now, we don't persist state between function calls
    // In production, you'd save to Vercel KV or a database
    console.log(`Would save ${notifiedSlots.size} notified slots to storage`);
  }

  /**
   * Create a unique identifier for a slot
   */
  getSlotId(slot) {
    const currentDate = this.getCurrentDate();
    return `${currentDate}-${slot.court}-${slot.time}`;
  }

  /**
   * Send notifications for available slots
   */
  async sendNotifications(availableSlots) {
    if (availableSlots.length === 0) {
      return {
        success: true,
        message: "No available slots found",
        slotsCount: 0
      };
    }

    // Get previously notified slots
    const notifiedSlots = await this.getNotifiedSlots();

    // Filter out already notified slots
    const newSlots = availableSlots.filter(
      (slot) => !notifiedSlots.has(this.getSlotId(slot))
    );

    if (newSlots.length === 0) {
      return {
        success: true,
        message: "No new slots to notify",
        slotsCount: availableSlots.length
      };
    }

    // Send individual messages for each new available slot
    const notifications = [];
    for (const slot of newSlots) {
      const slotId = this.getSlotId(slot);
      const message = `🎾 Turno disponible a las ${slot.time}hs en cancha ${slot.court}`;
      
      try {
        await this.sendTelegramMessage(message);
        notifiedSlots.add(slotId);
        notifications.push(message);
        
        // Add small delay between messages to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Failed to send notification for slot ${slotId}:`, error);
      }
    }

    // Save updated notified slots
    await this.saveNotifiedSlots(notifiedSlots);

    return {
      success: true,
      message: `Sent ${notifications.length} notifications`,
      slotsCount: availableSlots.length,
      newSlotsCount: newSlots.length,
      notifications
    };
  }

  /**
   * Main check function for serverless execution
   */
  async check() {
    try {
      console.log(`Checking court availability for ${this.getCurrentDate()}`);

      // Validate environment variables
      if (!process.env.TELEGRAM_BOT_TOKEN) {
        throw new Error("TELEGRAM_BOT_TOKEN environment variable is required");
      }

      if (!process.env.TELEGRAM_CHAT_ID) {
        throw new Error("TELEGRAM_CHAT_ID environment variable is required");
      }

      // Fetch availability data
      const data = await this.fetchAvailability();

      // Filter available slots
      const availableSlots = this.filterAvailableSlots(data);

      // Send notifications
      const result = await this.sendNotifications(availableSlots);

      return {
        success: true,
        date: this.getCurrentDate(),
        timeRange: `${this.startTime} - ${this.endTime}`,
        ...result
      };
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

      return {
        success: false,
        error: error.message,
        date: this.getCurrentDate()
      };
    }
  }
}

// Vercel serverless function handler
module.exports = async (req, res) => {
  const checker = new CourtAvailabilityChecker();
  const result = await checker.check();
  
  // Set appropriate status code
  const statusCode = result.success ? 200 : 500;
  
  res.status(statusCode).json(result);
};
