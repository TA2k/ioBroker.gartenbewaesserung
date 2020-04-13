"use strict";

/*
 * Created with @iobroker/create-adapter v1.23.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");
const SunCalc = require("suncalc");
const moment = require("moment");

// Load your modules here, e.g.:
// const fs = require("fs");

class Gartenbewaesserung extends utils.Adapter {
    /**
     * @param {Partial<ioBroker.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super({
            ...options,
            name: "gartenbewaesserung",
        });
        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        this.on("unload", this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Initialize your adapter here
        // Reset the connection indicator during startup
        this.setState("info.connection", false, true);
        // in this template all states changes inside the adapters namespace are subscribed

        this.clockInterval = null;
        this.pauseTime = 5000;
        this.bewaesserung_automatik = false;
        this.bewaesserungTimeouts = [];
        this.activeVentil = { name: "", end: "", dauer: 0 };
        this.bewaesserungEnd = null;
        this.tempAndRain = {};
        this.getWeatherAndSunInterval = null;
        this.currentLong = "13.404954";
        this.curentLang = "52.520008";
        this.ventile = [];

        if (this.config.zeitplan_enabled) {
            this.zeitplanArray = [];
            if (this.config.zeitplan_sonntag) {
                this.zeitplanArray.push(0);
            }
            if (this.config.zeitplan_montag) {
                this.zeitplanArray.push(1);
            }
            if (this.config.zeitplan_dienstag) {
                this.zeitplanArray.push(2);
            }
            if (this.config.zeitplan_mittwoch) {
                this.zeitplanArray.push(3);
            }
            if (this.config.zeitplan_donnerstag) {
                this.zeitplanArray.push(4);
            }
            if (this.config.zeitplan_freitag) {
                this.zeitplanArray.push(5);
            }
            if (this.config.zeitplan_samstag) {
                this.zeitplanArray.push(6);
            }
        }

        if (this.config.ventil1_enable) {
            this.ventile.push({
                id: "ventil1",
                name: this.config.ventil1_name,
                enable: this.config.ventil1_enable,
                dauer: this.config.ventil1_dauer,
                dauer_sec: this.config.ventil1_dauer_sec,
                state: this.config.ventil1_state,
                dauerstate: this.config.ventil1_dauerstate,

                dauer_in_state_mult: this.config.ventil1_dauer_in_state_mult,
                dauer_in_state: this.config.ventil1_dauer_in_state,
                feuchtigkeit: this.config.ventil1_feuchtigkeit,
                feuchtigkeit_tresh: this.config.ventil1_feuchtigkeit_tresh,
            });
        }
        if (this.config.ventil2_enable) {
            this.ventile.push({
                id: "ventil2",
                name: this.config.ventil2_name,
                enable: this.config.ventil2_enable,
                dauer: this.config.ventil2_dauer,
                dauer_sec: this.config.ventil2_dauer_sec,
                state: this.config.ventil2_state,
                dauerstate: this.config.ventil2_dauerstate,

                dauer_in_state_mult: this.config.ventil2_dauer_in_state_mult,
                dauer_in_state: this.config.ventil2_dauer_in_state,
                feuchtigkeit: this.config.ventil2_feuchtigkeit,
                feuchtigkeit_tresh: this.config.ventil2_feuchtigkeit_tresh,
            });
        }
        if (this.config.ventil3_enable) {
            this.ventile.push({
                id: "ventil3",
                name: this.config.ventil3_name,
                enable: this.config.ventil3_enable,
                dauer: this.config.ventil3_dauer,
                dauer_sec: this.config.ventil3_dauer_sec,
                state: this.config.ventil3_state,
                dauerstate: this.config.ventil3_dauerstate,

                dauer_in_state_mult: this.config.ventil3_dauer_in_state_mult,
                dauer_in_state: this.config.ventil3_dauer_in_state,
                feuchtigkeit: this.config.ventil3_feuchtigkeit,
                feuchtigkeit_tresh: this.config.ventil3_feuchtigkeit_tresh,
            });
        }
        if (this.config.ventil4_enable) {
            this.ventile.push({
                id: "ventil4",
                name: this.config.ventil4_name,
                enable: this.config.ventil4_enable,
                dauer: this.config.ventil4_dauer,
                dauer_sec: this.config.ventil4_dauer_sec,
                state: this.config.ventil4_state,
                dauerstate: this.config.ventil4_dauerstate,
                dauer_in_state_mult: this.config.ventil4_dauer_in_state_mult,
                dauer_in_state: this.config.ventil4_dauer_in_state,
                feuchtigkeit: this.config.ventil4_feuchtigkeit,
                feuchtigkeit_tresh: this.config.ventil4_feuchtigkeit_tresh,
            });
        }
        if (this.config.ventil5_enable) {
            this.ventile.push({
                id: "ventil5",
                name: this.config.ventil5_name,
                enable: this.config.ventil5_enable,
                dauer: this.config.ventil5_dauer,
                dauer_sec: this.config.ventil5_dauer_sec,
                state: this.config.ventil5_state,
                dauerstate: this.config.ventil5_dauerstate,
                dauer_in_state_mult: this.config.ventil5_dauer_in_state_mult,
                dauer_in_state: this.config.ventil5_dauer_in_state,
                feuchtigkeit: this.config.ventil5_feuchtigkeit,
                feuchtigkeit_tresh: this.config.ventil5_feuchtigkeit_tresh,
            });
        }
        if (this.ventile.length === 0) {
            this.log.info("Kein Ventil aktiviert.");
            return;
        }
        this.ventile.forEach(async (item, index) => {
            index++;
            const stringIndex = index.toString();
            // if (index < 10) {
            //     stringIndex = "0" + index;
            // }
            await this.setObjectNotExistsAsync("config.ventil" + stringIndex, {
                type: "device",
                common: {
                    name: "Ventil " + stringIndex,
                    role: "indicator",
                    write: true,
                    read: true,
                },
                native: {},
            });
            for (const property in item) {
                const value = item[property];
                await this.setObjectNotExistsAsync("config.ventil" + stringIndex + "." + property, {
                    type: "state",
                    common: {
                        name: property,
                        role: "indicator",
                        type: typeof value || "mixed",
                        write: true,
                        read: true,
                    },
                    native: {},
                });
                this.setState("config.ventil" + stringIndex + "." + property, value, true);
            }
            await this.setObjectNotExistsAsync("status.ventil" + stringIndex, {
                type: "device",
                common: {
                    name: "Ventil " + stringIndex,
                    role: "indicator",
                    write: true,
                    read: true,
                },
                native: {},
            });
            const status = [
                { name: "active", type: "string", unit: "" },
                { name: "ende", type: "string", unit: "Uhr" },
                { name: "restzeit", type: "number", unit: "min" },
                { name: "restzeit_sek", type: "number", unit: "sek" },
                { name: "fortschritt", type: "number", unit: "%" },
                { name: "feuchtigkeit", type: "number", unit: "" },
            ];
            for (const property of status) {
                await this.setObjectNotExistsAsync("status.ventil" + stringIndex + "." + property.name, {
                    type: "state",
                    common: {
                        name: property.name,
                        role: "indicator",
                        type: property.type,
                        write: false,
                        read: true,
                        unit: property.unit || "",
                    },
                    native: {},
                });
            }
        });
        for (const property in this.config) {
            if (property.startsWith("ventil")) {
                continue;
            }
            const value = this.config[property];
            await this.setObjectNotExistsAsync("config." + property, {
                type: "state",
                common: {
                    name: property,
                    role: "indicator",
                    type: typeof value || "mixed",
                    write: false,
                    read: true,
                },
                native: {},
            });
            this.setState("config." + property, value, true);
        }

        const status = [
            { name: "bewaesserung_automatik", type: "boolean", unit: "" },
            { name: "pumpe", type: "boolean", unit: "" },
            { name: "lautzeit_ende_uhrzeit", type: "string", unit: "Uhr" },
            { name: "restzeit", type: "number", unit: "min" },
            { name: "lautzeit_gesamt_in_sek", type: "number", unit: "sek" },
            { name: "restzeit_sek", type: "number", unit: "sek" },
            { name: "fortschritt", type: "number", unit: "%" },
            { name: "tempforecast", type: "number", unit: "°c" },
            { name: "rainforecast", type: "number", unit: "mm" },
            { name: "rainforecastnext", type: "number", unit: "mm" },
            { name: "sonnenaufgang", type: "string", unit: "Uhr" },
            { name: "sonnenuntergang", type: "string", unit: "Uhr" },
        ];
        for (const property of status) {
            await this.setObjectNotExistsAsync("status." + property.name, {
                type: "state",
                common: {
                    name: property.name,
                    role: "indicator",
                    type: property.type,
                    write: false,
                    read: true,
                    unit: property.unit || "",
                },
                native: {},
            });
        }
        const controls = [
            { name: "bewaesserung_aktiv", type: "boolean", unit: "" },
            // { name: "bewaesserung_pause", type: "boolean", unit: "" },
            { name: "ventil1_aktiv", type: "boolean", unit: "" },
            { name: "ventil2_aktiv", type: "boolean", unit: "" },
            { name: "ventil3_aktiv", type: "boolean", unit: "" },
            { name: "ventil4_aktiv", type: "boolean", unit: "" },
            { name: "ventil5_aktiv", type: "boolean", unit: "" },
        ];
        for (const property of controls) {
            await this.setObjectNotExistsAsync("control." + property.name, {
                type: "state",
                common: {
                    name: property.name,
                    role: "button",
                    type: property.type,
                    write: false,
                    read: true,
                    unit: property.unit || "",
                },
                native: {},
            });
        }
        this.stopVentile();

        await this.getForeignObjectAsync("system.config").then((obj) => {
            if (obj && obj.common && obj.common.longitude) {
                this.currentLong = obj.common.longitude;
                this.currentLat = obj.common.latitude;
            } else {
                this.log.warn("No Lat and Long in ioBroker settings found. Use city Berlin for sunrise and sunset.");
            }
        });
        await this.getWeatherAndSunData();
        this.checkForBewaesserungStart();
        this.subscribeStates("*");

        this.getWeatherAndSunInterval = setInterval(() => {
            this.getWeatherAndSunData();
        }, 30 * 60 * 1000); //30min
        this.clockInterval = setInterval(() => {
            this.checkForBewaesserungStart();
            this.updateVentileStatus();
        }, 10 * 1000); //10sec

        this.setState("info.connection", true, true);
    }
    async checkForBewaesserungStart() {
        if (!this.bewaesserung_automatik) {
            if (!this.config.temptresh || this.tempAndRain.temp >= this.config.temptresh) {
                if (!this.config.raintresh || this.tempAndRain.rain <= this.config.raintresh) {
                    if (!this.config.raintreshnext || this.tempAndRain.rainnext <= this.config.raintreshnext) {
                        if (!this.config.zeitplan_enabled || this.zeitplanArray.indexOf(moment().day()) !== -1) {
                            if (this.config.sonnenstand) {
                                const sunrise = moment(this.times.sunrise).add(this.config.minSonnenaufgang, "minute");
                                const sunset = moment(this.times.sunset).add(this.config.minSonnenuntergang, "minute");
                                if (moment().isSame(sunrise, "minute") || moment().isSame(sunset, "minute")) {
                                    this.startBewaesserung();
                                }
                            }

                            if (
                                (this.config.startzeit1_enable && moment().isSame(moment(this.config.startzeit1, "hh:mm"), "minute")) ||
                                (this.config.startzeit2_enable && moment().isSame(moment(this.config.startzeit2, "hh:mm"), "minute")) ||
                                (this.config.startzeit3_enable && moment().isSame(moment(this.config.startzeit3, "hh:mm"), "minute"))
                            ) {
                                this.startBewaesserung();
                            }
                        } else {
                            this.log.info("Bewässerung nicht gestartet weil der Zeitplan für den heutigen Wochentag deaktiviert ist.");
                        }
                    } else {
                        this.log.info("Bewässerung nicht gestartet wegen Regen Schwellwert für Morgen " + this.tempAndRain.rainnext);
                    }
                } else {
                    this.log.info("Bewässerung nicht gestartet wegen Regen Schwellwert " + this.tempAndRain.rain);
                }
            } else {
                this.log.info("Bewässerung nicht gestartet wegen Temperatur Schwellwert " + this.tempAndRain.temp);
            }
        }
    }
    async updateVentileStatus() {
        this.ventile.forEach((ventil) => {
            if (ventil.active) {
                this.setState("status." + ventil.id + ".restzeit", Math.abs(moment.duration(ventil.end.diff(moment())).asMinutes()).toFixed(2));
                this.setState("status." + ventil.id + ".restzeit_sek", Math.abs(moment.duration(ventil.end.diff(moment())).asSeconds()).toFixed(0));
                this.setState(
                    "status." + ventil.id + ".fortschritt",
                    Math.abs(100 - (100 * moment.duration(ventil.end.diff(moment())).asSeconds()) / (ventil.dauer * 60 + this.pauseTime / 1000)).toFixed(0)
                );
            }
        });

        if (this.bewaesserungEnd) {
            this.setState("status.restzeit", Math.abs(moment.duration(this.bewaesserungEnd.diff(moment())).asMinutes()).toFixed(2));
            this.setState("status.restzeit_sek", Math.abs(moment.duration(this.bewaesserungEnd.diff(moment())).asSeconds()).toFixed(0));
            this.setState("status.fortschritt", Math.abs(100 - (100 * moment.duration(this.bewaesserungEnd.diff(moment())).asSeconds()) / (this.stopTime / 1000)).toFixed(0));
        }
    }
    async startBewaesserung() {
        await this.stopBewaesserung();
        this.bewaesserung_automatik = true;
        this.log.info("Start Bewaesserung");
        this.setState("status.bewaesserung_automatik", true, true);
        this.currentTimeoutTime = 0;
        if (this.config.pumpen_state) {
            this.setForeignState(this.config.pumpen_state, true, false);
            this.setState("status.pumpe", true, true);
        }
        for (const ventil of this.ventile) {
            let dauer = ventil.dauer * 60;
            if (ventil.dauer_sec) {
                dauer = ventil.dauer;
            }
            if (this.tempAndRain[ventil.id + "feuchtigkeit"] !== undefined) {
                if (this.tempAndRain[ventil.id + "feuchtigkeit"] >= ventil.feuchtigkeit_tresh) {
                    this.log.info("Feuchtigkeit hat Schwellwert erreicht Dauer auf 0 gesetzt: " + this.tempAndRain[ventil.id + "feuchtigkeit"]);
                    dauer = 0;
                }
            }
            const ventilStopTime = this.currentTimeoutTime + dauer * 1000;
            this.stopTime = this.currentTimeoutTime + dauer * 1000;
            this.log.info("Start " + ventil.id + " in " + this.currentTimeoutTime / 1000 + "sek");
            const timeoutIdStart = setTimeout(() => {
                const end = moment().add(ventilStopTime, "millisecond");
                this.log.info("Start " + ventil.id);
                if (ventil.dauer_in_state) {
                    this.setForeignState(ventil.state, ventil.dauer * ventil.dauer_in_state_mult, false);
                } else {
                    this.setForeignState(ventil.state, true, false);
                }
                if (ventil.dauerstate) {
                    let multi = 1;
                    if (ventil.dauer_sec) {
                        multi = 60;
                    }
                    this.setForeignState(ventil.dauerstate, ventil.dauer * multi, false);
                }
                this.setState("status." + ventil.id + ".active", true, false);
                this.setState("status." + ventil.id + ".ende", end.toLocaleString(), false);
                ventil.active = true;
                ventil.end = end;
            }, this.currentTimeoutTime);
            this.bewaesserungTimeouts.push(timeoutIdStart);

            this.log.info("Stop " + ventil.id + " in " + ventilStopTime / 1000 + "sek");
            const timeoutIdStop = setTimeout(() => {
                this.log.info("Stop " + ventil.id);
                this.updateVentileStatus();
                this.setForeignState(ventil.state, false, false);

                this.setState("status." + ventil.id + ".active", false, false);
                this.setState("status." + ventil.id + ".ende", "", false);
                ventil.active = false;
                ventil.end = "";
                if (this.ventile.indexOf(ventil) === this.ventile.length - 1) {
                    this.stopBewaesserung();
                }
            }, this.stopTime);
            this.bewaesserungTimeouts.push(timeoutIdStop);
            if (this.ventile.indexOf(ventil) !== this.ventile.length - 1) {
                this.currentTimeoutTime = ventilStopTime + this.pauseTime;
            }
        }
        this.bewaesserungEnd = moment().add(this.stopTime, "millisecond");

        this.setState("status.lautzeit_ende_uhrzeit", this.bewaesserungEnd.toLocaleString());
        this.setState("status.lautzeit_gesamt_in_sek", moment.duration(this.bewaesserungEnd.diff(moment())).asSeconds().toFixed(0));
        this.updateVentileStatus();
    }
    stopBewaesserung() {
        return new Promise(async (resolve, reject) => {
            this.stopVentile();
            this.bewaesserungEnd = "";
            this.bewaesserungTimeouts.forEach((timeout) => {
                clearTimeout(timeout);
            });
            this.bewaesserung_automatik = false;
            this.updateVentileStatus();
            await this.setStateAsync("status.bewaesserung_automatik", false, true);
            if (this.config.pumpen_state) {
                await this.setForeignStateAsync(this.config.pumpen_state, false, false);
                this.setState("status.pumpe", false, true);
            }
            resolve();
        });
    }
    async getWeatherAndSunData() {
        return new Promise(async (resolve, reject) => {
            if (this.config.tempforecast) {
                await this.getForeignStateAsync(this.config.tempforecast)
                    .then((obj) => {
                        if (obj) {
                            this.setState("status.tempforecast", obj.val, true);
                            this.tempAndRain.temp = obj.val;
                        }
                    })
                    .catch((error) => this.log.error("Cannot receive temp forecast from:" + this.config.tempforecast + " " + JSON.stringify(error)));
            }
            if (this.config.rainforecast) {
                await this.getForeignStateAsync(this.config.rainforecast)
                    .then((obj) => {
                        if (obj) {
                            this.setState("status.rainforecast", obj.val, true);
                            this.tempAndRain.rain = obj.val;
                        }
                    })
                    .catch((error) => this.log.error("Cannot receive rain forecast from:" + this.config.rainforecast + " " + JSON.stringify(error)));
            }
            if (this.config.rainforecastnext) {
                await this.getForeignStateAsync(this.config.rainforecastnext)
                    .then((obj) => {
                        if (obj) {
                            this.setState("status.rainforecastnext", obj.val, true);
                            this.tempAndRain.rainnext = obj.val;
                        }
                    })
                    .catch((error) => this.log.error("Cannot receive rain forecast from:" + this.config.rainforecastnext + " " + JSON.stringify(error)));
            }

            this.ventile &&
                this.ventile.forEach(async (item) => {
                    if (item.feuchtikeit) {
                        await this.getForeignStateAsync(item.feuchtigkeit)
                            .then((obj) => {
                                if (obj) {
                                    this.setState("status." + item.id + ".feuchtigkeit", obj.val, true);
                                    this.tempAndRain[item.id + "feuchtigkeit"] = obj.val;
                                }
                            })
                            .catch((error) => this.log.error("Cannot receive feuchtigkeit from:" + item.feuchtigkeit + " " + JSON.stringify(error)));
                    }
                });
            this.times = SunCalc.getTimes(new Date(), this.currentLat, this.currentLong);
            this.setState("status.sonnenaufgang", this.times.sunrise.toTimeString());
            this.setState("status.sonnenuntergang", this.times.sunset.toTimeString());
            resolve();
        });
    }

    stopVentile(id) {
        return new Promise(async (resolve, reject) => {
            const promiseArray = [];
            this.ventile &&
                this.ventile.forEach(async (item) => {
                    const promise = new Promise(async (resolve, reject) => {
                        if (!id || item.id === id) {
                            if (item.state) {
                                this.log.info("Stop Ventil: " + item.id);
                                await this.setForeignStateAsync(item.state, false).catch((err) => {
                                    if (err) this.log.error(err);
                                });
                                if (this.config.pumpen_state) {
                                    this.setForeignState(this.config.pumpen_state, false, false);
                                    this.setState("status.pumpe", false, true);
                                }
                                this.updateVentileStatus();
                                this.setState("status." + item.id + ".active", false, false);
                                this.setState("status." + item.id + ".ende", "", false);
                                item.active = false;
                                item.end = "";
                            }
                            if (item.timeout) {
                                clearTimeout(item.timeout);
                            }
                        }
                        resolve();
                    });
                    promiseArray.push(promise);
                });
            Promise.all(promiseArray).then(() => {
                resolve();
            });
        });
    }
    async startVentil(id) {
        this.stopVentile(id).then(async () => {
            const ventil = this.ventile.find((obj) => {
                return obj.id === id;
            });
            this.log.info("Start Ventil: " + ventil.id);
            if (ventil.dauer_in_state) {
                this.setForeignState(ventil.state, ventil.dauer * ventil.dauer_in_state_mult, false);
            } else {
                this.setForeignState(ventil.state, true, false);
            }
            if (ventil.dauerstate) {
                let multi = 1;
                if (ventil.dauer_sec) {
                    multi = 60;
                }
                this.setForeignState(ventil.dauerstate, ventil.dauer * multi, false);
            }
            if (this.config.pumpen_state) {
                this.setForeignState(this.config.pumpen_state, true, false);
                this.setState("status.pumpe", true, true);
            }
            const end = moment().add(ventil.dauer * 60 * 1000, "millisecond");
            this.log.info("Start " + ventil.id);
            this.setState("status." + ventil.id + ".active", true, false);
            this.setState("status." + ventil.id + ".ende", end.toLocaleString(), false);
            ventil.active = true;
            ventil.end = end;

            this.log.info("Ventil: " + ventil.id + " will stop in " + ventil.dauer + "min");
            ventil.timeout = setTimeout(() => {
                this.updateVentileStatus();
                this.setState("status." + id + ".active", false, false);
                this.setState("status." + id + ".ende", "", false);
                this.stopVentile(id);
            }, ventil.dauer * 60 * 1000);
            this.updateVentileStatus();
        });
    }
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            this.stopVentile();
            this.stopBewaesserung();
            clearInterval(this.clockInterval);
            clearInterval(this.getWeatherAndSunInterval);

            this.ventile.forEach(async (item) => {
                if (item.timeout) clearTimeout(item.timeout);
            });
            this.bewaesserungTimeouts.forEach(async (item) => {
                if (item) clearTimeout(item);
            });
            this.log.info("cleaned everything up...");
            callback();
        } catch (e) {
            callback();
        }
    }

    /**
     * Is called if a subscribed state changes
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    async onStateChange(id, state) {
        if (state && !state.ack) {
            if (id.indexOf(".control.") !== -1) {
                if (id.indexOf(".bewaesserung_aktiv") !== -1) {
                    if (state.val) {
                        this.startBewaesserung();
                    } else {
                        this.stopBewaesserung();
                    }
                }
                if (id.indexOf(".ventil1_aktiv") !== -1) {
                    if (state.val) {
                        this.startVentil("ventil1");
                    } else {
                        this.stopVentile("ventil1");
                    }
                }
                if (id.indexOf(".ventil2_aktiv") !== -1) {
                    if (state.val) {
                        this.startVentil("ventil2");
                    } else {
                        this.stopVentile("ventil2");
                    }
                }
                if (id.indexOf(".ventil3_aktiv") !== -1) {
                    if (state.val) {
                        this.startVentil("ventil3");
                    } else {
                        this.stopVentile("ventil3");
                    }
                }
                if (id.indexOf(".ventil4_aktiv") !== -1) {
                    if (state.val) {
                        this.startVentil("ventil4");
                    } else {
                        this.stopVentile("ventil4");
                    }
                }
                if (id.indexOf(".ventil5_aktiv") !== -1) {
                    if (state.val) {
                        this.startVentil("ventil5");
                    } else {
                        this.stopVentile("ventil5");
                    }
                }
            }
            if (id.indexOf(".config.") !== -1) {
                const idArray = id.split(".");
                const configId = idArray[idArray.length - 1];
                const ventil = idArray[idArray.length - 2];
                const adapterConfig = "system.adapter." + this.name + "." + this.instance;
                const config = await this.getForeignObjectAsync(adapterConfig);
                if (ventil.indexOf("ventil") !== -1) {
                    config.native[ventil + "_" + configId] = state.val;
                    this.config[ventil + "_" + configId] = state.val;
                    await this.setForeignObjectAsync(adapterConfig, config);
                    this.log.info("Set: " + ventil + "_" + configId + ": " + state.val);
                } else {
                    config.native[configId] = state.val;
                    this.config[configId] = state.val;
                    await this.setForeignObjectAsync(adapterConfig, config);
                    this.log.info("Set: " + configId + ": " + state.val);
                }
            }
        } else {
            // The state was deleted
        }
    }
}

// @ts-ignore parent is a valid property on module
if (module.parent) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<ioBroker.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new Gartenbewaesserung(options);
} else {
    // otherwise start the instance directly
    new Gartenbewaesserung();
}
