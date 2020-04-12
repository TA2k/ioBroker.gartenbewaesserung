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
        this.ventileTimeouts = [];
        this.activeVentil = { name: "", end: "", dauer: 0 };
        this.bewaesserungEnd = "";
        this.getWeatherAndSunInterval = null;
        this.currentLong = "13.404954";
        this.curentLang = "52.520008";
        this.ventile = [];
        if (this.config.ventil1_enable) {
            this.ventile.push({
                id: "ventil1",
                name: this.config.ventil1_name,
                enable: this.config.ventil1_enable,
                dauer: this.config.ventil1_dauer,
                dauer_sec: this.config.ventil1_dauer_sec,
                state: this.config.ventil1_state,
                dauerstate: this.config.ventil1_dauerstate,
                dauerstate_enable: this.config.ventil1_dauerstate_enable,
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
                dauerstate_enable: this.config.ventil2_dauerstate_enable,
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
                dauerstate_enable: this.config.ventil3_dauerstate_enable,
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
                dauerstate_enable: this.config.ventil4_dauerstate_enable,
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
                        type: typeof value,
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
                    type: typeof value,
                    write: false,
                    read: true,
                },
                native: {},
            });
            this.setState("config." + property, value, true);
        }

        const status = [
            { name: "bewaesserung_automatik", type: "boolean", unit: "" },
            { name: "lautzeit_ende_uhrzeit", type: "string", unit: "Uhr" },
            { name: "restzeit", type: "number", unit: "min" },
            { name: "lautzeit_gesamt_in_sek", type: "number", unit: "sek" },
            { name: "restzeit_sek", type: "number", unit: "sek" },
            { name: "fortschritt", type: "number", unit: "%" },
            { name: "tempforecast", type: "number", unit: "°c" },
            { name: "rainforecast", type: "number", unit: "mm" },
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
        ];
        for (const property of controls) {
            await this.setObjectNotExistsAsync("control." + property.name, {
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
    }
    async checkForBewaesserungStart() {
        if (!this.bewaesserung_automatik) {
            if (this.config.sonnenstand) {
                const sunrise = moment(this.times.sunrise).add(this.config.minSonnenaufgang, "minute");
                const sunset = moment(this.times.sunset).add(this.config.minSonnenuntergang, "minute");
                if (moment().isSame(sunrise, "minute") || moment().isSame(sunset, "minute")) {
                    this.startBewaesserung();
                }
            }
        }
        if (
            (this.config.startzeit1_enable && moment().isSame(moment(this.config.startzeit1, "hh:mm"), "minute")) ||
            (this.config.startzeit2_enable && moment().isSame(moment(this.config.startzeit2, "hh:mm"), "minute")) ||
            (this.config.startzeit3_enable && moment().isSame(moment(this.config.startzeit3, "hh:mm"), "minute"))
        ) {
            this.startBewaesserung();
        }
    }
    async updateVentileStatus() {
        if (this.activeVentil && this.activeVentil.name) {
            this.setState("status." + this.activeVentil.name + ".restzeit", moment().subtract(this.activeVentil.end).minute());
            this.setState("status." + this.activeVentil.name + ".restzeit_sek", moment().subtract(this.activeVentil.end).second());
            this.setState("status." + this.activeVentil.name + ".fortschritt", (this.activeVentil.dauer * 100) / moment().subtract(this.activeVentil.end).second());
        }
        if (this.bewaesserungEnd) {
            this.setState("status.restzeit", moment().subtract(this.bewaesserungEnd).minute());
            this.setState("status.restzeit_sek", moment().subtract(this.bewaesserungEnd).second());
            this.setState("status.fortschritt", ((this.currentTimeoutTime / 1000) * 100) / moment().subtract(this.bewaesserungEnd).second());
        }
    }
    async startBewaesserung() {
        await this.stopBewaesserung();
        this.bewaesserung_automatik = true;
        this.setState("status.bewaesserung_automatik", true, true);
        this.currentTimeoutTime = 0;
        for (const ventil in this.ventile) {
            let dauer = ventil.dauer * 60;
            if (ventil.dauer_sec) {
                dauer = ventil.dauer;
            }
            const stopTime = this.currentTimeoutTime + dauer * 1000;
            this.log.info("Start " + ventil.id + " in " + this.currentTimeoutTime / 1000 + "sek");
            const timeoutIdStart = setTimeout(() => {
                const end = moment().add(stopTime, "millisecond");
                this.log.info("Start " + ventil.id);
                this.setState(ventil.state, true, false);
                this.setState("status." + ventil.id + ".active", true, false);
                this.setState("status." + ventil.id + ".ende", end.toLocaleString(), false);
                this.activeVentil.name = ventil.id;
                this.activeVentil.end = end;
                this.activeVentil.dauer = dauer;
            }, this.currentTimeoutTime);
            this.ventileTimeouts.push(timeoutIdStart);

            this.log.info("Stop " + ventil.id + " in " + stopTime / 1000 + "sek");
            const timeoutIdStop = setTimeout(() => {
                this.log.info("Stop " + ventil.id);
                this.setState(ventil.state, false, false);

                this.setState("status." + ventil.id + ".active", false, false);
                this.setState("status." + ventil.id + ".ende", "", false);
                this.activeVentil.name = "";
                this.activeVentil.end = "";
                this.activeVentil.dauer = 0;
            }, stopTime);
            this.ventileTimeouts.push(timeoutIdStop);
            this.currentTimeoutTime = stopTime + this.pauseTime;
        }
        this.bewaesserungEnd = moment().add(this.currentTimeoutTime, "millisecond");

        this.setState("status.lautzeit_ende_uhrzeit", this.bewaesserungEnd.toLocaleString());
        this.setState("status.lautzeit_gesamt_in_sek", this.bewaesserungEnd.seconds());
    }
    stopBewaesserung() {
        return new Promise(async (resolve, reject) => {
            this.stopVentile();
            this.bewaesserungEnd = "";
            for (const timeout in this.ventileTimeouts) {
                clearTimeout(timeout);
            }
            this.bewaesserung_automatik = false;
            await this.setStateAsyncs("status.bewaesserung_automatik", false, true);
            resolve();
        });
    }
    async getWeatherAndSunData() {
        return new Promise(async (resolve, reject) => {
            if (this.config.tempforecast) {
                await this.getForeignStateAsync(this.config.tempforecast)
                    .then((obj) => {
                        obj && this.setState("status.tempforecast", obj.val, true);
                    })
                    .catch((error) => this.log.error("Cannot receive temp forecast from:" + this.config.tempforecast + " " + JSON.stringify(error)));
            }
            if (this.config.rainforecast) {
                await this.getForeignStateAsync(this.config.rainforecast)
                    .then((obj) => {
                        obj && this.setState("status.rainforecast", obj.val, true);
                    })
                    .catch((error) => this.log.error("Cannot receive rain forecast from:" + this.config.rainforecast + " " + JSON.stringify(error)));
            }
            this.times = SunCalc.getTimes(new Date(), this.currentLat, this.currentLong);
            this.setState("status.sonnenaufgang", this.times.sunrise.toTimeString());
            this.setState("status.sonnenuntergang", this.times.sunset.toTimeString());
            resolve();
        });
    }

    stopVentile() {
        this.ventile &&
            this.ventile.forEach(async (item) => {
                if (item.state) {
                    this.setState(item.state, false, (err) => {
                        if (err) this.log.error(err);
                    });
                }
            });
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            clearInterval(this.clockInterval);
            clearInterval(this.getWeatherAndSunInterval);

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
    onStateChange(id, state) {
        if (state) {
            // The state was changed
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
