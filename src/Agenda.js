class Agenda {
    constructor() {
        this.eventList = [];
    }

    set setEvents(eventList) {
        if (!Array.isArray(eventList))
            throw new Error("EventList must be an array");
        if (
            !eventList.every(
                (event) =>
                    event !== undefined &&
                    event !== null &&
                    event instanceof Event
            )
        )
            throw new Error("EventList must be an array of Event");
        this.eventList = eventList;
    }

    getAllEvents() {
        return [...this.eventList];
    }

    getNthEvent(n) {
        if (n < 0 || n > this.eventList.length - 1) {
            throw new Error("Index out of range");
        }
        return this.eventList[n];
    }

    getAllEventsByClassroom(classroom) {
        return this.eventList.filter(
            (event) => event.getClassroom() === classroom
        );
    }

    getAllEventsByDescription(description) {
        return this.eventList.filter(
            (event) => event.getDescription() === description
        );
    }

    getAllEventsByDiscipline(discipline) {
        return this.eventList.filter(
            (event) => event.getDiscipline() === discipline
        );
    }

    getAllEventsByType(type) {
        return this.eventList.filter((event) => event.getType() === type);
    }

    getAllEventsByInstructor(instructor) {
        return this.eventList.filter((event) =>
            event.getInstructors().includes(instructor)
        );
    }
    getEventById(id) {
        return this.eventList.find((event) => event.getId() === id);
    }

    getAllEventsByDate(beginningDate, endingDate) {
        return this.eventList.filter((event) =>
            event.getBeginningDate() >= beginningDate &&
            (endingDate === undefined || endingDate === null)
                ? true
                : event.getEndingDate() <= endingDate
        );
    }
}
