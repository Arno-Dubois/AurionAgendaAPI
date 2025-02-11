class Agenda {
    constructor() {
        this.events = [];
    }

    getAllEvents() {
        return this.events;
    }

    getNthEvent(n) {
        if (n < 0 || n > this.events.length - 1) {
            throw new Error("Index out of range");
        }
        return this.events[n];
    }

    getAllEventsByClassroom(classroom) {
        return this.events.filter(
            (event) => event.getClassroom() === classroom
        );
    }

    getAllEventsByDescription(description) {
        return this.events.filter(
            (event) => event.getDescription() === description
        );
    }

    getAllEventsByDiscipline(discipline) {
        return this.events.filter(
            (event) => event.getDiscipline() === discipline
        );
    }

    getAllEventsByType(type) {
        return this.events.filter((event) => event.getType() === type);
    }

    getAllEventsByInstructor(instructor) {
        return this.events.filter((event) =>
            event.getInstructors().includes(instructor)
        );
    }
    getEventById(id) {
        return this.events.find((event) => event.getId() === id);
    }

    getAllEventsByDate(beginningDate, endingDate) {
        return this.events.filter((event) =>
            event.getBeginningDate() >= beginningDate &&
            (endingDate === undefined || endingDate === null)
                ? true
                : event.getEndingDate() <= endingDate
        );
    }
}
