function getSpecificDateAtMidnightCET() {
    const year = new Date().getFullYear();
    const month = new Date().getMonth();
    const day = new Date().getDate();

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

// Example usage for February 11, 2025
const year = 2025;
const month = 2; // February is month 2
const day = 11;

const specificDateMidnightCET = getSpecificDateAtMidnightCET();
console.log(specificDateMidnightCET);
