"use strict";

/*
 * Created with @iobroker/create-adapter v1.23.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");
const SunCalc = require("suncalc");
const moment = require("moment");
const momentDurationFormatSetup = require("moment-duration-format");
momentDurationFormatSetup(moment);
const Sentry = require("@sentry/node");
Sentry.init({ dsn: "https://730f0e6bc501405399b19a879fde7bbd@o378982.ingest.sentry.io/5203164" });

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

    this.ventile = [];
    this.clockInterval = null;
    this.bewaesserung_automatik = false;
    this.bewaesserungTimeouts = [];
    this.bewaesserungEnd = null;
    this.tempAndRain = {};
    this.getWeatherAndSunInterval = null;
    this.currentLong = "13.404954";
    this.curentLang = "52.520008";
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
    this.bewaesserung_automatik = false;
    this.bewaesserungTimeouts = [];
    this.bewaesserungEnd = null;
    this.tempAndRain = {};
    this.getWeatherAndSunInterval = null;
    this.currentLong = "13.404954";
    this.curentLang = "52.520008";

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

    this.readVentilConfig();

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
        { name: "active", type: "boolean", unit: "" },
        { name: "ende", type: "string", unit: "Uhr" },
        { name: "endeTimestamp", type: "number", unit: "" },
        { name: "restzeit", type: "string", unit: "min" },
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
          write: true,
          read: true,
        },
        native: {},
      });
      this.setState("config." + property, value, true);
    }

    const status = [
      { name: "bewaesserung_automatik", type: "boolean", unit: "" },
      { name: "pumpe", type: "boolean", unit: "" },
      { name: "lautzeit_ende_uhrzeit", type: "string", unit: "" },
      { name: "lautzeit_ende_uhrzeitTimestamp", type: "number", unit: "" },
      { name: "restzeit", type: "string", unit: "min" },
      { name: "lautzeit_gesamt_in_sek", type: "number", unit: "sek" },
      { name: "restzeit_sek", type: "number", unit: "sek" },
      { name: "fortschritt", type: "number", unit: "%" },
      { name: "tempforecast", type: "number", unit: "°c" },
      { name: "rainforecast", type: "number", unit: "mm" },
      { name: "rainforecastnext", type: "number", unit: "mm" },
      { name: "sonnenaufgang", type: "string", unit: "Uhr" },
      { name: "sonnenuntergang", type: "string", unit: "Uhr" },
      { name: "startMorgen", type: "string", unit: "Uhr" },
      { name: "startAbend", type: "string", unit: "Uhr" },
      { name: "startMorgenTimestamp", type: "number", unit: "" },
      { name: "startAbendTimestamp", type: "number", unit: "" },
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
      { name: "pumpe", type: "boolean", unit: "" },
      // { name: "bewaesserung_pause", type: "boolean", unit: "" },
      { name: "ventil1_aktiv", type: "boolean", unit: "" },
      { name: "ventil2_aktiv", type: "boolean", unit: "" },
      { name: "ventil3_aktiv", type: "boolean", unit: "" },
      { name: "ventil4_aktiv", type: "boolean", unit: "" },
      { name: "ventil5_aktiv", type: "boolean", unit: "" },
      { name: "ventil6_aktiv", type: "boolean", unit: "" },
      { name: "ventil7_aktiv", type: "boolean", unit: "" },
      { name: "ventil8_aktiv", type: "boolean", unit: "" },
      { name: "ventil9_aktiv", type: "boolean", unit: "" },
      { name: "ventil10_aktiv", type: "boolean", unit: "" },
    ];
    for (const property of controls) {
      await this.setObjectNotExistsAsync("control." + property.name, {
        type: "state",
        common: {
          name: property.name,
          role: "switch",
          type: property.type,
          write: true,
          read: true,
          unit: property.unit || "",
        },
        native: {},
      });
    }
    this.stopVentile();
    this.stopBewaesserung();
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
    }, this.config.updateinterval * 1000); //10sec

    this.setState("info.connection", true, true);
  }
  readVentilConfig() {
    this.ventile = [];

    this.ventile.push({
      id: "ventil1",
      name: this.config.ventil1_name,
      enable: this.config.ventil1_enable,
      dauer: this.config.ventil1_dauer,
      dauerstate_mult: this.config.ventil1_dauerstate_mult,
      state: this.config.ventil1_state,
      dauerstate: this.config.ventil1_dauerstate,
      dauer_in_state_mult: this.config.ventil1_dauer_in_state_mult,
      dauer_in_state: this.config.ventil1_dauer_in_state,
      feuchtigkeit: this.config.ventil1_feuchtigkeit,
      feuchtigkeit_tresh: this.config.ventil1_feuchtigkeit_tresh,
      feuchtigkeit_falsefeucht: this.config.ventil1_feuchtigkeit_falsefeucht,
    });
    this.ventile.push({
      id: "ventil2",
      name: this.config.ventil2_name,
      enable: this.config.ventil2_enable,
      dauer: this.config.ventil2_dauer,
      dauerstate_mult: this.config.ventil2_dauerstate_mult,
      state: this.config.ventil2_state,
      dauerstate: this.config.ventil2_dauerstate,
      dauer_in_state_mult: this.config.ventil2_dauer_in_state_mult,
      dauer_in_state: this.config.ventil2_dauer_in_state,
      feuchtigkeit: this.config.ventil2_feuchtigkeit,
      feuchtigkeit_tresh: this.config.ventil2_feuchtigkeit_tresh,
      feuchtigkeit_falsefeucht: this.config.ventil2_feuchtigkeit_falsefeucht,
    });
    this.ventile.push({
      id: "ventil3",
      name: this.config.ventil3_name,
      enable: this.config.ventil3_enable,
      dauer: this.config.ventil3_dauer,
      dauerstate_mult: this.config.ventil3_dauerstate_mult,
      state: this.config.ventil3_state,
      dauerstate: this.config.ventil3_dauerstate,
      dauer_in_state_mult: this.config.ventil3_dauer_in_state_mult,
      dauer_in_state: this.config.ventil3_dauer_in_state,
      feuchtigkeit: this.config.ventil3_feuchtigkeit,
      feuchtigkeit_tresh: this.config.ventil3_feuchtigkeit_tresh,
      feuchtigkeit_falsefeucht: this.config.ventil3_feuchtigkeit_falsefeucht,
    });
    this.ventile.push({
      id: "ventil4",
      name: this.config.ventil4_name,
      enable: this.config.ventil4_enable,
      dauer: this.config.ventil4_dauer,
      dauerstate_mult: this.config.ventil4_dauerstate_mult,
      state: this.config.ventil4_state,
      dauerstate: this.config.ventil4_dauerstate,
      dauer_in_state_mult: this.config.ventil4_dauer_in_state_mult,
      dauer_in_state: this.config.ventil4_dauer_in_state,
      feuchtigkeit: this.config.ventil4_feuchtigkeit,
      feuchtigkeit_tresh: this.config.ventil4_feuchtigkeit_tresh,
      feuchtigkeit_falsefeucht: this.config.ventil4_feuchtigkeit_falsefeucht,
    });
    this.ventile.push({
      id: "ventil5",
      name: this.config.ventil5_name,
      enable: this.config.ventil5_enable,
      dauer: this.config.ventil5_dauer,
      dauerstate_mult: this.config.ventil5_dauerstate_mult,
      state: this.config.ventil5_state,
      dauerstate: this.config.ventil5_dauerstate,
      dauer_in_state_mult: this.config.ventil5_dauer_in_state_mult,
      dauer_in_state: this.config.ventil5_dauer_in_state,
      feuchtigkeit: this.config.ventil5_feuchtigkeit,
      feuchtigkeit_tresh: this.config.ventil5_feuchtigkeit_tresh,
      feuchtigkeit_falsefeucht: this.config.ventil5_feuchtigkeit_falsefeucht,
    });
    this.ventile.push({
      id: "ventil6",
      name: this.config.ventil6_name,
      enable: this.config.ventil6_enable,
      dauer: this.config.ventil6_dauer,
      dauerstate_mult: this.config.ventil6_dauerstate_mult,
      state: this.config.ventil6_state,
      dauerstate: this.config.ventil6_dauerstate,
      dauer_in_state_mult: this.config.ventil6_dauer_in_state_mult,
      dauer_in_state: this.config.ventil6_dauer_in_state,
      feuchtigkeit: this.config.ventil6_feuchtigkeit,
      feuchtigkeit_tresh: this.config.ventil6_feuchtigkeit_tresh,
      feuchtigkeit_falsefeucht: this.config.ventil6_feuchtigkeit_falsefeucht,
    });
    this.ventile.push({
      id: "ventil7",
      name: this.config.ventil7_name,
      enable: this.config.ventil7_enable,
      dauer: this.config.ventil7_dauer,
      dauerstate_mult: this.config.ventil7_dauerstate_mult,
      state: this.config.ventil7_state,
      dauerstate: this.config.ventil7_dauerstate,
      dauer_in_state_mult: this.config.ventil7_dauer_in_state_mult,
      dauer_in_state: this.config.ventil7_dauer_in_state,
      feuchtigkeit: this.config.ventil7_feuchtigkeit,
      feuchtigkeit_tresh: this.config.ventil7_feuchtigkeit_tresh,
      feuchtigkeit_falsefeucht: this.config.ventil7_feuchtigkeit_falsefeucht,
    });
    this.ventile.push({
      id: "ventil8",
      name: this.config.ventil8_name,
      enable: this.config.ventil8_enable,
      dauer: this.config.ventil8_dauer,
      dauerstate_mult: this.config.ventil8_dauerstate_mult,
      state: this.config.ventil8_state,
      dauerstate: this.config.ventil8_dauerstate,
      dauer_in_state_mult: this.config.ventil8_dauer_in_state_mult,
      dauer_in_state: this.config.ventil8_dauer_in_state,
      feuchtigkeit: this.config.ventil8_feuchtigkeit,
      feuchtigkeit_tresh: this.config.ventil8_feuchtigkeit_tresh,
      feuchtigkeit_falsefeucht: this.config.ventil8_feuchtigkeit_falsefeucht,
    });
    this.ventile.push({
      id: "ventil9",
      name: this.config.ventil9_name,
      enable: this.config.ventil9_enable,
      dauer: this.config.ventil9_dauer,
      dauerstate_mult: this.config.ventil9_dauerstate_mult,
      state: this.config.ventil9_state,
      dauerstate: this.config.ventil9_dauerstate,
      dauer_in_state_mult: this.config.ventil9_dauer_in_state_mult,
      dauer_in_state: this.config.ventil9_dauer_in_state,
      feuchtigkeit: this.config.ventil9_feuchtigkeit,
      feuchtigkeit_tresh: this.config.ventil9_feuchtigkeit_tresh,
      feuchtigkeit_falsefeucht: this.config.ventil9_feuchtigkeit_falsefeucht,
    });
    this.ventile.push({
      id: "ventil10",
      name: this.config.ventil10_name,
      enable: this.config.ventil10_enable,
      dauer: this.config.ventil10_dauer,
      dauerstate_mult: this.config.ventil10_dauerstate_mult,
      state: this.config.ventil10_state,
      dauerstate: this.config.ventil10_dauerstate,
      dauer_in_state_mult: this.config.ventil10_dauer_in_state_mult,
      dauer_in_state: this.config.ventil10_dauer_in_state,
      feuchtigkeit: this.config.ventil10_feuchtigkeit,
      feuchtigkeit_tresh: this.config.ventil10_feuchtigkeit_tresh,
      feuchtigkeit_falsefeucht: this.config.ventil10_feuchtigkeit_falsefeucht,
    });
  }
  checkTresholds() {
    if (!this.config.temptresh || this.tempAndRain.temp === undefined || this.tempAndRain.temp >= this.config.temptresh) {
      if (!this.config.raintresh || this.tempAndRain.rain === undefined || this.tempAndRain.rain <= this.config.raintresh) {
        if (
          !this.config.raintreshnext ||
          this.tempAndRain.rainnext === undefined ||
          this.tempAndRain.rainnext <= this.config.raintreshnext
        ) {
          if (!this.config.zeitplan_enabled || this.zeitplanArray.indexOf(moment().day()) !== -1) {
            return true;
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
    return false;
  }
  async checkForBewaesserungStart() {
    if (!this.bewaesserung_automatik) {
      if (this.config.sonnenstand) {
        const sunrise = moment(this.times.sunrise).add(this.config.minSonnenaufgang, "minute");
        const sunset = moment(this.times.sunset).add(this.config.minSonnenuntergang, "minute");
        if (moment().isSame(sunrise, "minute") || moment().isSame(sunset, "minute")) {
          if (this.checkTresholds()) {
            this.startBewaesserung();
          }
        }
      }

      if (
        (this.config.startzeit1_enable && moment().isSame(moment(this.config.startzeit1, "hh:mm"), "minute")) ||
        (this.config.startzeit2_enable && moment().isSame(moment(this.config.startzeit2, "hh:mm"), "minute")) ||
        (this.config.startzeit3_enable && moment().isSame(moment(this.config.startzeit3, "hh:mm"), "minute"))
      ) {
        if (this.checkTresholds()) {
          this.startBewaesserung();
        }
      }
    }
  }
  async updateVentileStatus() {
    this.ventile.forEach((ventil) => {
      if (ventil.active) {
        if (ventil.end) {
          this.log.debug("Diff:" + ventil.end.diff(moment()));
          this.log.debug("Duration:" + moment.duration(ventil.end.diff(moment())));
          this.log.debug("Abs:" + moment.duration(ventil.end.diff(moment())).abs());
          this.log.debug("Format:" + moment.duration(ventil.end.diff(moment())).abs().format("mm:ss"));
          this.setState(
            "status." + ventil.id + ".restzeit",
            moment.duration(ventil.end.diff(moment())).abs().format("mm:ss", { trim: false }),
            true,
          );
          this.setState(
            "status." + ventil.id + ".restzeit_sek",
            Number(Math.abs(moment.duration(ventil.end.diff(moment())).asSeconds()).toFixed(0)),
            true,
          );
          this.setState(
            "status." + ventil.id + ".fortschritt",
            Number(
              Math.abs(
                100 -
                  (100 * moment.duration(ventil.end.diff(moment())).asSeconds()) / (ventil.dauer * 60 + parseInt(this.config.pauseTime)),
              ).toFixed(0),
            ),
            true,
          );
        } else {
          this.setState("status." + ventil.id + ".restzeit", "0:00", true);
          this.setState("status." + ventil.id + ".restzeit_sek", 0, true);
          this.setState("status." + ventil.id + ".fortschritt", 100, true);
        }
      }
    });

    if (this.bewaesserungEnd) {
      this.setState("status.restzeit", moment.duration(this.bewaesserungEnd.diff(moment())).abs().format("mm:ss", { trim: false }), true);
      this.setState(
        "status.restzeit_sek",
        Number(Math.abs(moment.duration(this.bewaesserungEnd.diff(moment())).asSeconds()).toFixed(0)),
        true,
      );
      this.setState(
        "status.fortschritt",
        Number(
          Math.abs(100 - (100 * moment.duration(this.bewaesserungEnd.diff(moment())).asSeconds()) / (this.stopTime / 1000)).toFixed(0),
        ),
        true,
      );
    }
  }
  async startBewaesserung() {
    await this.stopBewaesserung();
    this.bewaesserung_automatik = true;
    this.log.info("Start Bewaesserung");
    this.setState("status.bewaesserung_automatik", true, true);
    this.setState("control.bewaesserung_aktiv", true, true);
    this.currentTimeoutTime = 0;
    if (this.config.pumpen_state) {
      this.log.info("Start pumpe");
      await this.setForeignStateAsync(this.config.pumpen_state, true, false);
      this.setState("status.pumpe", true, true);
      this.setState("control.pumpe", true, true);
    }
    const ventileEnabled = this.ventile.filter(function (e) {
      return e.enable;
    });
    for (const ventil of this.ventile) {
      if (!ventil.enable) {
        continue;
      }
      let dauer = ventil.dauer * 60;

      if (this.tempAndRain[ventil.id + "feuchtigkeit"] !== undefined) {
        if (ventil.feuchtigkeit_falsefeucht && this.tempAndRain[ventil.id + "feuchtigkeit"] === false) {
          this.log.info("Feuchtigkeitsensor ist False, Dauer auf 0 gesetzt: " + this.tempAndRain[ventil.id + "feuchtigkeit"]);
          dauer = 0;
        }
        if (this.tempAndRain[ventil.id + "feuchtigkeit"] >= ventil.feuchtigkeit_tresh) {
          this.log.info("Feuchtigkeit hat Schwellwert erreicht Dauer auf 0 gesetzt: " + this.tempAndRain[ventil.id + "feuchtigkeit"]);
          dauer = 0;
        }
      }
      const ventilStopTime = this.currentTimeoutTime + dauer * 1000;
      this.stopTime = this.currentTimeoutTime + dauer * 1000;
      if (dauer > 0) {
        this.log.info("Start " + ventil.id + " in " + this.currentTimeoutTime / 1000 + "sek");
        const timeoutIdStart = setTimeout(async () => {
          const end = moment().add(ventil.dauer * 60, "second");
          this.setState("status." + ventil.id + ".ende", end.toLocaleString(), true);
          this.setState("status." + ventil.id + ".endeTimestamp", end.unix(), true);
          ventil.end = end;
          await this.activateVentil(ventil);
          this.updateVentileStatus();
        }, this.currentTimeoutTime);
        this.bewaesserungTimeouts.push(timeoutIdStart);
      }

      this.log.info("Stop " + ventil.id + " in " + ventilStopTime / 1000 + "sek");
      const timeoutIdStop = setTimeout(() => {
        this.deactivateVentil(ventil);
        if (ventileEnabled.indexOf(ventil) === ventileEnabled.length - 1) {
          this.stopBewaesserung();
        }
      }, this.stopTime);
      this.bewaesserungTimeouts.push(timeoutIdStop);
      if (ventileEnabled.indexOf(ventil) !== ventileEnabled.length - 1) {
        this.currentTimeoutTime = ventilStopTime + parseInt(this.config.pauseTime) * 1000;
      }
    }
    this.bewaesserungEnd = moment().add(this.stopTime, "millisecond");

    this.setState("status.lautzeit_ende_uhrzeit", this.bewaesserungEnd.toLocaleString(), true);
    this.setState("status.lautzeit_ende_uhrzeitTimestamp", this.bewaesserungEnd.unix(), true);
    this.setState(
      "status.lautzeit_gesamt_in_sek",
      Number(moment.duration(this.bewaesserungEnd.diff(moment())).asSeconds().toFixed(0)),
      true,
    );
    this.updateVentileStatus();
  }
  async deactivateVentil(ventil) {
    return new Promise(async (resolve, reject) => {
      if (!ventil.state) {
        this.log.error("No state available for ventil: " + ventil.id);
        resolve();
        return;
      }
      this.log.info("Stop " + ventil.id);
      this.updateVentileStatus();
      let stopValue = false;
      if (ventil.state.indexOf("smartgarden.") === 0 || ventil.state.indexOf("gardena.") === 0) {
        this.log.debug("Use stop value: STOP_UNTIL_NEXT_TASK");
        stopValue = "STOP_UNTIL_NEXT_TASK";
      }
      await this.setForeignStateAsync(ventil.state, stopValue, false);
      this.setState("status." + ventil.id + ".active", false, true);
      this.setState("control." + ventil.id + "_aktiv", false, true);
      this.setState("status." + ventil.id + ".ende", null, true);
      this.setState("status." + ventil.id + ".fortschritt", 100, true);
      this.setState("status." + ventil.id + ".restzeit", "0:00", true);
      this.setState("status." + ventil.id + ".restzeit_sek", 0, true);
      ventil.active = false;
      ventil.end = "";
      resolve();
    });
  }

  async activateVentil(ventil) {
    return new Promise(async (resolve, reject) => {
      if (!ventil.state) {
        this.log.error("No state available for ventil: " + ventil.id);
        resolve();
        return;
      }
      if (ventil.dauerstate) {
        let multi = 1;
        if (ventil.dauerstate_mult) {
          multi = parseInt(ventil.dauerstate_mult);
        }
        this.log.info("Set: " + ventil.dauerstate + " to: " + ventil.dauer * multi);
        await this.setForeignStateAsync(ventil.dauerstate, ventil.dauer * multi, false);
        await this.sleep(1000);
      }
      this.log.info("Start " + ventil.id);
      if (ventil.dauer_in_state) {
        this.setForeignState(ventil.state, ventil.dauer * ventil.dauer_in_state_mult, false);
      } else {
        this.setForeignState(ventil.state, true, false);
      }

      this.setState("status." + ventil.id + ".active", true, true);
      this.setState("control." + ventil.id + "_aktiv", true, true);
      ventil.active = true;
      resolve();
    });
  }

  stopBewaesserung() {
    return new Promise(async (resolve, reject) => {
      this.log.info("Bewässerung stop");
      this.stopVentile();
      this.bewaesserungEnd = "";
      this.bewaesserungTimeouts.forEach((timeout) => {
        clearTimeout(timeout);
      });
      this.bewaesserung_automatik = false;
      this.updateVentileStatus();

      await this.setStateAsync("status.bewaesserung_automatik", false, true);
      this.setStateAsync("control.bewaesserung_aktiv", false, true);
      if (this.config.pumpen_state) {
        await this.setForeignStateAsync(this.config.pumpen_state, false, false);
        this.setState("status.pumpe", false, true);
        this.setState("control.pumpe", false, true);
      }
      resolve();
    });
  }
  async getWeatherAndSunData() {
    return new Promise(async (resolve, reject) => {
      try {
        if (this.config.tempforecast) {
          await this.getForeignStateAsync(this.config.tempforecast)
            .then((obj) => {
              if (obj) {
                this.setState("status.tempforecast", obj.val, true);
                this.tempAndRain.temp = obj.val;
              }
            })
            .catch((error) =>
              this.log.error("Cannot receive temp forecast from:" + this.config.tempforecast + " " + JSON.stringify(error)),
            );
        }
        if (this.config.rainforecast) {
          await this.getForeignStateAsync(this.config.rainforecast)
            .then((obj) => {
              if (obj) {
                this.setState("status.rainforecast", obj.val, true);
                this.tempAndRain.rain = obj.val;
              }
            })
            .catch((error) =>
              this.log.error("Cannot receive rain forecast from:" + this.config.rainforecast + " " + JSON.stringify(error)),
            );
        }
        if (this.config.rainforecastnext) {
          await this.getForeignStateAsync(this.config.rainforecastnext)
            .then((obj) => {
              if (obj) {
                this.setState("status.rainforecastnext", obj.val, true);
                this.tempAndRain.rainnext = obj.val;
              }
            })
            .catch((error) =>
              this.log.error("Cannot receive rain forecast from:" + this.config.rainforecastnext + " " + JSON.stringify(error)),
            );
        }

        this.ventile &&
          this.ventile.forEach(async (item) => {
            if (item.feuchtigkeit) {
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
        this.setState("status.sonnenaufgang", this.times.sunrise.toTimeString(), true);
        this.setState("status.sonnenuntergang", this.times.sunset.toTimeString(), true);
        if (isNaN(this.times.sunrise)) {
          this.log.warn("Cannot calc sunrise and sunset please check your lat long value in the ioBroker settings");
          resolve();
          return;
        }
        if (this.times && this.times.sunrise) {
          this.setState(
            "status.startMorgen",
            moment(this.times.sunrise.toISOString()).add(this.config.minSonnenaufgang, "minutes").toLocaleString(),
            true,
          );
          this.setState(
            "status.startMorgenTimestamp",
            moment(this.times.sunrise.toISOString()).add(this.config.minSonnenaufgang, "minutes").unix(),
            true,
          );
        }
        if (this.times && this.times.sunset) {
          this.setState(
            "status.startAbend",
            moment(this.times.sunset.toISOString()).add(this.config.minSonnenuntergang, "minutes").toLocaleString(),
            true,
          );
          this.setState(
            "status.startAbendTimestamp",
            moment(this.times.sunset.toISOString()).add(this.config.minSonnenuntergang, "minutes").unix(),
            true,
          );
        }
        resolve();
      } catch (error) {
        this.log.error(error.stack);
        resolve();
      }
    });
  }

  stopVentile(id) {
    return new Promise((resolve, reject) => {
      const promiseArray = [];
      this.ventile &&
        this.ventile.forEach(async (item) => {
          const promise = new Promise(async (resolve, reject) => {
            if (!id || item.id === id) {
              if (item.state && item.enable) {
                await this.deactivateVentil(item);
                if (this.config.pumpen_state) {
                  this.setForeignState(this.config.pumpen_state, false, false);
                  this.setState("status.pumpe", false, true);
                  this.setState("control.pumpe", false, true);
                }
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
      if (!ventil.enable) {
        this.log.info("Cannot start " + ventil.id + " because not enabled");

        return;
      }
      if (this.config.pumpen_state) {
        this.log.info("Start Pumpe");
        await this.setForeignStateAsync(this.config.pumpen_state, true, false);
        await this.setStateAsync("status.pumpe", true, true);
        this.setStateAsync("control.pumpe", true, true);
      }
      const end = moment().add(ventil.dauer * 60 * 1000, "millisecond");
      this.setState("status." + ventil.id + ".ende", end.toLocaleString(), false);
      this.setState("status." + ventil.id + ".endeTimestamp", end.unix(), false);
      ventil.end = end;

      this.activateVentil(ventil);

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
  async onUnload(callback) {
    this.setState("info.connection", false, true);
    try {
      await this.stopVentile();
      await this.stopBewaesserung();
      clearInterval(this.clockInterval);
      clearInterval(this.getWeatherAndSunInterval);

      this.ventile.forEach(async (item) => {
        if (item.timeout) clearTimeout(item.timeout);
      });
      this.bewaesserungTimeouts.forEach(async (item) => {
        if (item) clearTimeout(item);
      });
      this.ventile = [];
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
        if (id.indexOf(".pumpe") !== -1) {
          if (this.config.pumpen_state) {
            this.setForeignState(this.config.pumpen_state, state.val, false);
            this.setState("status.pumpe", state.val, true);
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
        if (id.indexOf(".ventil6_aktiv") !== -1) {
          if (state.val) {
            this.startVentil("ventil6");
          } else {
            this.stopVentile("ventil6");
          }
        }
        if (id.indexOf(".ventil7_aktiv") !== -1) {
          if (state.val) {
            this.startVentil("ventil7");
          } else {
            this.stopVentile("ventil7");
          }
        }
        if (id.indexOf(".ventil8_aktiv") !== -1) {
          if (state.val) {
            this.startVentil("ventil8");
          } else {
            this.stopVentile("ventil8");
          }
        }
        if (id.indexOf(".ventil9_aktiv") !== -1) {
          if (state.val) {
            this.startVentil("ventil9");
          } else {
            this.stopVentile("ventil9");
          }
        }
        if (id.indexOf(".ventil10_aktiv") !== -1) {
          if (state.val) {
            this.startVentil("ventil10");
          } else {
            this.stopVentile("ventil10");
          }
        }
      }
      if (id.indexOf(".config.") !== -1) {
        const idArray = id.split(".");
        const configId = idArray[idArray.length - 1];
        const ventil = idArray[idArray.length - 2];
        const adapterConfig = "system.adapter." + this.name + "." + this.instance;
        const config = await this.getForeignObjectAsync(adapterConfig);
        if (config) {
          if (ventil.indexOf("ventil") !== -1) {
            config.native[ventil + "_" + configId] = state.val;
            this.config[ventil + "_" + configId] = state.val;
            await this.setForeignObjectAsync(adapterConfig, config);
            this.log.info("Set: " + ventil + "_" + configId + ": " + state.val);
            this.readVentilConfig();
          } else {
            config.native[configId] = state.val;
            this.config[configId] = state.val;
            await this.setForeignObjectAsync(adapterConfig, config);
            this.log.info("Set: " + configId + ": " + state.val);
          }
        }
      }
    } else {
      // The state was deleted
    }
  }
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
