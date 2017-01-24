"use strict";

var self = module.exports = {
    connecting: false,

    init: function() {
        console.log("Initializing Harmony Hub app...");
        self.listenForTriggers();
        console.log("Initializing Harmony Hub app completed.");
    },

    /**
     * Starts listening for specific triggers and sends them to the requested Harmony Hub.
     * 
     * @returns {} 
     */
    listenForTriggers: function() {

        Array.prototype.sortBy = function(p) {
            return this.slice(0)
                .sort(function(a, b) {
                    return (a[p] > b[p]) ? 1 : (a[p] < b[p]) ? -1 : 0;
                });
        }

        Homey.manager("flow")
            .on("action.start_activity.activity.autocomplete",
                function(callback, args) {
                    Homey.manager("drivers").getDriver("hub").autocompleteActivity(args, callback);
                });

        Homey.manager("flow")
            .on("action.send_command_to_device.device.autocomplete",
                function(callback, args) {
                    Homey.manager("drivers").getDriver("hub").autocompleteDevice(args, callback);
                });

        Homey.manager("flow")
            .on("action.send_command_to_device.controlGroup.autocomplete",
                function(callback, args) {
                    //Homey.log(JSON.stringify(args));
                    if (args.args.device.length === 0) {
                        callback(null, []);
                        return;
                    }

                    var listOfControlGroups = [];
                    args.args.device.controlGroup.forEach(function(controlGroup) {
                        if (args.query.length === 0 ||
                            controlGroup.name.toUpperCase().indexOf(args.query.toUpperCase()) !== -1) {
                            listOfControlGroups.push(controlGroup);
                        }
                    });

                    callback(null, listOfControlGroups.sortBy("name"));
                });

        Homey.manager("flow")
            .on("action.send_command_to_device.action.autocomplete",
                function(callback, args) {
                    //Homey.log(JSON.stringify(args));
                    if (args.args.device.length === 0 || args.args.controlGroup.length === 0) {
                        callback(null, []);
                        return;
                    }

                    var actions = [];
                    args.args.controlGroup.function.forEach(function(action) {
                        if (args.query.length === 0 ||
                            action.label.toUpperCase().indexOf(args.query.toUpperCase()) !== -1) {
                            action.name = action.label;
                            actions.push(action);
                        }
                    });

                    callback(null, actions.sortBy("name"));
                });

        Homey.manager("flow")
            .on("action.start_activity",
                function(callback, args) {
                    Homey.manager("drivers").getDriver("hub").startActivity(args, callback);
                });

        Homey.manager("flow")
            .on("action.send_command_to_device",
                function(callback, args) {
                    Homey.manager("drivers").getDriver("hub").sendCommandToDevice(args, callback);
                });

        Homey.manager("flow")
            .on("action.all_off",
                function(callback, args) {
                    Homey.manager("drivers").getDriver("hub").allOff(args, callback);
                });

        console.log("Listening for triggers...");
    },

    updateSettings: function(settings, callback) {
        // Update settings.
        Homey.manager("settings").set("reconnect_interval", parseInt(settings.reconnectIntervalInSeconds));
        Homey.manager("settings").set("enable_speech", settings.enableSpeech === "true");
        console.log("Settings updated: " + JSON.stringify(settings));

        // Return success
        if (callback) callback(null, true);
    }
};