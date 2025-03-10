const today = new GetTodayDate(
    new Date().getFullYear(),
    new Date().getMonth(),
    new Date().getDate()
);
class getTodayAgenda extends FetchAurion {
    fetchTodayAgenda() {
        const beginDate = today;
        const endDate = today.setDay(today.getDay() + 1);
        return super.fetchAgenda(beginDate, endDate);
    }

    fetchYesterdayAgenda() {
        const yesterday = today.setDay(today.getDay() - 1);
        return super.fetchAgenda(yesterday, today);
    }

    fetchTomorrowAgenda() {
        const tomorrow = today.setDay(today.getDay() + 1);
        const afterTomorrow = today.setDay(tomorrow.getDay() + 2);
        return super.fetchAgenda(tomorrow, afterTomorrow);
    }

    fetchThisWeekAgenda() {
        const thisWeek = today.setDay(today.getDay());
        const nextWeek = today.setDay(thisWeek.getDay() + 7);
        return super.fetchAgenda(thisWeek, nextWeek);
    }
}
