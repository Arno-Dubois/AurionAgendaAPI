class GetTodayDate {
    getTodayDate(value, type) {
        if (type === "year") {
        // Create a new date object with the specified date at midnight UTC
        const utcMidnight = new Date(Date.UTC(year, month, day, 0, 0, 0));

        // Convert the UTC date to CET
        const cetMidnight = new Date(
            utcMidnight.toLocaleString(undefined, {
                timeZone: "CET",
            })
        );
        return cetMidnight;
    }

}
