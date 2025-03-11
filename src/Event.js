class Event {
    constructor(
        classroom,
        description,
        discipline,
        type,
        instructors,
        id,
        beginningDate,
        endingDate
    ) {
        this.classroom = classroom;
        this.description = description;
        this.type = type;
        this.discipline = discipline;
        this.instructors = instructors;
        this.id = id;
        this.beginningDate = beginningDate;
        this.endingDate = endingDate;
    }

    /**
     * @param {{ classroom: any; description: any; type: any; discipline: any; instructors: any; id: any; beginningDate: any; endingDate: any; }} event
     */
    set setEvent(event) {
        if (event === undefined || event === null)
            throw new Error("Event must be defined");
        if (
            event.classroom === undefined ||
            event.classroom === null ||
            typeof event.classroom !== "string"
        )
            throw new Error("Classroom must be a string");
        if (
            event.description === undefined ||
            event.description === null ||
            typeof event.description !== "string"
        )
            throw new Error("Description must be a string");
        if (
            event.type === undefined ||
            event.type === null ||
            typeof event.type !== "string"
        )
            throw new Error("Type must be a string");
        if (
            event.discipline === undefined ||
            event.discipline === null ||
            typeof event.discipline !== "string"
        )
            throw new Error("Discipline must be a string");
        if (
            event.instructors === undefined ||
            event.instructors === null ||
            typeof event.instructors !== "string"
        )
            throw new Error("Instructors must be a string");
        if (
            event.id === undefined ||
            event.id === null ||
            typeof event.id !== "number"
        )
            throw new Error("Id must be a number");
        if (
            event.beginningDate === undefined ||
            event.beginningDate === null ||
            !(event.beginningDate instanceof Date())
        )
            throw new Error("BeginningDate must be a Date");
        if (
            event.endingDate === undefined ||
            event.endingDate === null ||
            !(event.endingDate instanceof Date())
        )
            throw new Error("EndingDate must be a Date");
        if (event.beginningDate > event.endingDate)
            throw new Error("BeginningDate must be before EndingDate");

        this.classroom = event.classroom;
        this.description = event.description;
        this.type = event.type;
        this.discipline = event.discipline;
        this.instructors = event.instructors;
        this.id = event.id;
        this.beginningDate = event.beginningDate;
        this.endingDate = event.endingDate;
    }

    get getClassroom() {
        return this.classroom;
    }

    get getDescription() {
        return this.description;
    }

    get getType() {
        return this.type;
    }

    get getDiscipline() {
        return this.discipline;
    }

    get getInstructors() {
        return this.instructors;
    }

    get getId() {
        return this.id;
    }

    get getBeginningDate() {
        return this.beginningDate;
    }

    get getEndingDate() {
        return this.endingDate;
    }
}

export default Event;
