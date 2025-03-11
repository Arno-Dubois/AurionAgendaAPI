const AurionAgendaAPI = require("aurion-agenda-api"); // Replace with the actual package name if different

async function getAgenda(username, password) {
    try {
        const connection = new AurionAgendaAPI.Connection(username, password);
        const todayAgenda = new AurionAgendaAPI.Agenda(); // Or however the Agenda class is accessed
        todayAgenda.setEvents = await connection.fetchTodayAgenda();
        const events = todayAgenda.getAllEvents();
        console.log(events);
    } catch (error) {
        console.error("Error fetching agenda:", error);
    }
}

getAgenda("your_username", "your_password");
