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
            return this.slice(0).sort(function(a, b) {
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
                    if (args.args.device.length === 0) {
                        callback(null, []);
                        return;
                    }

                    callback(null, args.args.device.controlGroup.sortBy("name"));
                });

        Homey.manager("flow")
            .on("action.send_command_to_device.action.autocomplete",
                function(callback, args) {
                    if (args.args.device.length === 0 || args.args.controlGroup.length === 0) {
                        callback(null, []);
                        return;
                    }

                    var actions = [];
                    args.args.controlGroup.function.forEach(function(action) {
                        action.name = action.label;
                        actions.push(action);
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
    }
};