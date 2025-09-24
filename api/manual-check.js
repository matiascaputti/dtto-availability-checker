// Manual trigger endpoint for testing
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

  getCurrentDate() {
    const today = new Date();
    return today.toISOString().split("T")[0];
  }

  timeToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(":").map(Number);
    return hours * 60 + minutes;
  }

  isTimeInRange(timeStr) {
    const timeMinutes = this.timeToMinutes(timeStr);
    const startMinutes = this.timeToMinutes(this.startTime);
    const endMinutes = this.timeToMinutes(this.endTime);
    return timeMinutes >= startMinutes && timeMinutes <= endMinutes;
  }

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

  filterAvailableSlots(data) {
    const availableSlots = [];
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
      let slots = court.slots || court.availability || court.times || [];

      if (court.schedule) {
        slots = court.schedule;
      }

      slots.forEach((slot) => {
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

  async sendTelegramMessage(message) {
    try {
      await this.telegramBot.sendMessage(this.chatId, message);
    } catch (error) {
      console.error("Error sending Telegram message:", error.message);
      throw error;
    }
  }

  async check() {
    try {
      console.log(`Manual check for ${this.getCurrentDate()}`);

      if (!process.env.TELEGRAM_BOT_TOKEN) {
        throw new Error("TELEGRAM_BOT_TOKEN environment variable is required");
      }

      if (!process.env.TELEGRAM_CHAT_ID) {
        throw new Error("TELEGRAM_CHAT_ID environment variable is required");
      }

      const data = await this.fetchAvailability();
      const availableSlots = this.filterAvailableSlots(data);

      // For manual checks, always send a summary
      if (availableSlots.length === 0) {
        const message = `🔍 Manual check: No hay turnos disponibles entre ${this.startTime} y ${this.endTime} para hoy.`;
        await this.sendTelegramMessage(message);
      } else {
        const message =
          `🔍 Manual check: ${availableSlots.length} turnos disponibles:\n` +
          availableSlots
            .map((slot) => `• ${slot.time}hs - ${slot.court}`)
            .join("\n");
        await this.sendTelegramMessage(message);
      }

      return {
        success: true,
        date: this.getCurrentDate(),
        timeRange: `${this.startTime} - ${this.endTime}`,
        slotsCount: availableSlots.length,
        slots: availableSlots,
      };
    } catch (error) {
      console.error("Error in manual check:", error.message);

      try {
        const errorMessage = `❌ Manual check error: ${error.message}`;
        await this.sendTelegramMessage(errorMessage);
      } catch (telegramError) {
        console.error(
          "Failed to send error notification:",
          telegramError.message
        );
      }

      return {
        success: false,
        error: error.message,
        date: this.getCurrentDate(),
      };
    }
  }
}

module.exports = async (req, res) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const startTime = new Date().toISOString();

  try {
    const checker = new CourtAvailabilityChecker();
    const result = await checker.check();

    const endTime = new Date().toISOString();
    const statusCode = result.success ? 200 : 500;

    res.status(statusCode).json({
      ...result,
      executionTime: {
        start: startTime,
        end: endTime,
        duration: `${Date.parse(endTime) - Date.parse(startTime)}ms`,
      },
      trigger: "manual",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      trigger: "manual",
      timestamp: new Date().toISOString(),
    });
  }
};
