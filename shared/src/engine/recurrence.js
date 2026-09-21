/** Dates anchored to the template, so Jan 31 -> Feb 28 -> Mar 31. */
export function recurringDates(startDate, frequency, throughDate, endDate = throughDate) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const limit = endDate < throughDate ? endDate : throughDate;
  const dates = [];
  if (Number.isNaN(start.getTime())) return dates;
  for (let n = 1; n <= 1000; n++) {
    let date;
    if (frequency === 'weekly' || frequency === 'fortnightly') date = new Date(start.getTime() + n * (frequency === 'weekly' ? 7 : 14) * 86400000);
    else {
      const month = start.getUTCMonth() + n * (frequency === 'yearly' ? 12 : 1);
      const last = new Date(Date.UTC(start.getUTCFullYear(), month + 1, 0)).getUTCDate();
      date = new Date(Date.UTC(start.getUTCFullYear(), month, Math.min(start.getUTCDate(), last)));
    }
    const key = date.toISOString().slice(0, 10);
    if (key > limit) break;
    dates.push(key);
  }
  return dates;
}
