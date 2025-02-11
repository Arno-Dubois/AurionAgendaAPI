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

    getClassroom() {
        return this.classroom;
    }

    getDescription() {
        return this.description;
    }

    getType() {
        return this.type;
    }

    getDiscipline() {
        return this.discipline;
    }

    getInstructors() {
        return this.instructors;
    }

    getId() {
        return this.id;
    }

    getBeginningDate() {
        return this.beginningDate;
    }

    getEndingDate() {
        return this.endingDate;
    }
}
