const axios = require("axios");

class BookingManager {
  constructor() {
    this.bookingApiUrl = "https://alquilatucancha.com/api/v2/bookings";
  }

  async createBooking(bookingData) {
    try {
      const requiredFields = [
        "datetime",
        "duration",
        "court_id",
        "sport_id",
        "name",
        "email",
        "from",
        "phone",
      ];

      for (const field of requiredFields) {
        if (!bookingData[field]) {
          throw new Error(`Missing required field: ${field}`);
        }
      }

      if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(bookingData.datetime)) {
        throw new Error(
          'Invalid datetime format. Expected: "YYYY-MM-DD HH:MM"'
        );
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bookingData.email)) {
        throw new Error("Invalid email format");
      }

      const response = await axios.post(this.bookingApiUrl, bookingData, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.AUTH_TOKEN}`,
        },
      });

      return { success: true, data: response.data, bookingData };
    } catch (error) {
      console.error("Error creating booking:", error.message);

      if (error.response) {
        return {
          success: false,
          error: error.response.data,
          statusCode: error.response.status,
        };
      }

      return { success: false, error: error.message };
    }
  }

  async createBookingFromSlot(slot, customerInfo) {
    const bookingData = {
      datetime: `${slot.date} ${slot.time}`,
      duration: slot.duration || 90,
      court_id: slot.courtId,
      sport_id: customerInfo.sport_id || 7,
      name: customerInfo.name,
      email: customerInfo.email,
      from: "web",
      phone: customerInfo.phone,
    };

    return await this.createBooking(bookingData);
  }

  formatBookingMessage(result, bookingData) {
    if (result.success) {
      return `⏳ Turno bloqueado
👉 Link para confirmar reserva: https://alquilatucancha.com/checkout/bookings/${result.data?.data?.id}?is_beelup=false
📅 Fecha: ${bookingData.datetime}
⏱️ Duración: ${bookingData.duration} minutos
🎾 Cancha: ${bookingData.court_name}
👤 Nombre: ${bookingData.name}
📧 Email: ${bookingData.email}
📱 Teléfono: ${bookingData.phone}`;
    }

    return `❌ Error al reservar: ${
      result.error ? JSON.stringify(result.error) : "Error desconocido"
    }`;
  }
}

module.exports = BookingManager;
