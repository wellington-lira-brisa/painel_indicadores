/**
 * Vendorizado de dateutils.js (projeto de feriados enviado pelo usuário).
 * Conteúdo idêntico ao original — só ganhou `export` nas constantes para
 * funcionar como módulo ES em vez de scripts globais soltos.
 */
export const DOMINGO = 0;
export const SEGUNDA_FEIRA = 1;
export const TERCA_FEIRA = 2;
export const QUARTA_FEIRA = 3;
export const QUINTA_FEIRA = 4;
export const SEXTA_FEIRA = 5;
export const SABADO = 6;

export const JANEIRO = 1 - 1;
export const FEVEREIRO = 2 - 1;
export const MARCO = 3 - 1;
export const ABRIL = 4 - 1;
export const MAIO = 5 - 1;
export const JUNHO = 6 - 1;
export const JULHO = 7 - 1;
export const AGOSTO = 8 - 1;
export const SETEMBRO = 9 - 1;
export const OUTUBRO = 10 - 1;
export const NOVEMBRO = 11 - 1;
export const DEZEMBRO = 12 - 1;

Date.prototype.addDays = function (days) {
    days = parseInt(days, 10);
    return new Date(this.valueOf() + 1000 * 60 * 60 * 24 * days);
}

Date.prototype.isEqualTo = function (otherDate) {
    return this.getTime() === otherDate.getTime();
}

Date.prototype.getNextWeekday = function (nextDayOfWeek) {
    var thisDayOfWeek = this.getDay();
    if (thisDayOfWeek == nextDayOfWeek) {
        return this;
    }
    else {
        var daysToAdd = (nextDayOfWeek + 7 - thisDayOfWeek) % 7;
        return this.addDays(daysToAdd);
    }
}

Date.prototype.countDaysUpTo = function (endDate) {
    const oneDay = 24 * 60 * 60 * 1000; // hours*minutes*seconds*milliseconds
    return Math.round(Math.abs((endDate - this) / oneDay)) + 1;
}