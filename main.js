"use strict";

/*
 * Created with @iobroker/create-adapter v1.23.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");

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
        this.ventile = [];
        if (this.config.ventil1_active) {
            this.ventile.push({
                id: "ventil1",
                name: this.config.ventil1_name,
                active: this.config.ventil1_active,
                dauer: this.config.ventil1_dauer,
                dauer_sec: this.config.ventil1_dauer_sec,
                state: this.config.ventil1_state,
                dauerstate: this.config.ventil1_dauerstate,
                dauerstate_active: this.config.ventil1_dauerstate_active,
            });
        }
        if (this.config.ventil2_active) {
            this.ventile.push({
                id: "ventil2",
                name: this.config.ventil2_name,
                active: this.config.ventil2_active,
                dauer: this.config.ventil2_dauer,
                dauer_sec: this.config.ventil2_dauer_sec,
                state: this.config.ventil2_state,
                dauerstate: this.config.ventil2_dauerstate,
                dauerstate_active: this.config.ventil2_dauerstate_active,
            });
        }
        if (this.config.ventil3_active) {
            this.ventile.push({
                id: "ventil3",
                name: this.config.ventil3_name,
                active: this.config.ventil3_active,
                dauer: this.config.ventil3_dauer,
                dauer_sec: this.config.ventil3_dauer_sec,
                state: this.config.ventil3_state,
                dauerstate: this.config.ventil3_dauerstate,
                dauerstate_active: this.config.ventil3_dauerstate_active,
            });
        }
        if (this.config.ventil4_active) {
            this.ventile.push({
                id: "ventil4",
                name: this.config.ventil4_name,
                active: this.config.ventil4_active,
                dauer: this.config.ventil4_dauer,
                dauer_sec: this.config.ventil4_dauer_sec,
                state: this.config.ventil4_state,
                dauerstate: this.config.ventil4_dauerstate,
                dauerstate_active: this.config.ventil4_dauerstate_active,
            });
        }

        this.ventile.forEach(async (item, index) => {
            index++;
            let stringIndex = index.toString();
            if (index < 10) {
                stringIndex = "0" + index;
            }
            await this.setObjectNotExistsAsync("ventil" + stringIndex, {
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

        this.stopVentile();
        this.subscribeStates("*");
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
