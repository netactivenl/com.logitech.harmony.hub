"use strict";

var harmony = require("harmonyhubjs-client");

var self = module.exports = {
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

        /**
         * Starts the specified activity through the given harmony client.
         * 
         * @param {} harmonyClient 
         * @param {} activityName 
         * @returns {} true/false
         */
        function startActivity(harmonyClient, activityName) {
            harmonyClient.getActivities()
                .then(function(activities) {
                    activities.some(function(activity) {
                        if (activity.label === activityName) {
                            // Found the activity we want.
                            console.log("Activity '" + activityName + "' found. Starting...");
                            var id = activity.id;
                            harmonyClient.startActivity(id);
                            harmonyClient.end();
                            console.log("Activity '" + activityName + "' started.");
                            return true;
                        }

                        // This activity is not the one we want.
                        return false;
                    });
                });
        }

        /**
         * Turns off all devices through the given harmony client.
         * 
         * @param {} harmonyClient 
         * @returns {} true/false
         */
        function turnOff(harmonyClient) {
            console.log("Turning all devices off...");
            harmonyClient.turnOff();
            harmonyClient.end();
            console.log("All devices turned off.");
            return true;
        }

        Homey.manager("flow").on("action.start_activity", function(callback, args) {
            console.log("Starting activity '" + args.activity + "' on " + args.hub.ipaddress + "...");
            harmony(args.hub.ipaddress)
                .then(function(harmonyClient) {
                    console.log("- Client connected.");
                    harmonyClient.isOff()
                        .then(function(off) {
                            if (off) {
                                console.log("- Hub status: off");
                                var started = startActivity(harmonyClient, args.activity);
                                callback(null, started);
                            } else {
                                console.log("- Hub status: on");
                                harmonyClient.getCurrentActivity()
                                    .then(function(currentActivityId) {
                                        console.log("Current activity: " + currentActivityId);
                                        var switched;
                                        if (currentActivityId !== args.activity) {
                                            // TODO: This is now always executed, because we compared and ID with an activity name.
                                            // TODO: This should be refactored, after we implement selecting an activity on the flow card (instead of typing it).
                                            console.log("Switching activity...");
                                            switched = startActivity(harmonyClient, args.activity);
                                        } else {
                                            console.log("Requested activity already selected.");
                                            switched = true;
                                            harmonyClient.end();
                                        }
                                        callback(null, switched);
                                    });
                            }
                        });
                });

            callback(null, true);
        });

        Homey.manager("flow").on("action.all_off", function(callback, args) {
            harmony(args.hub.ipaddress)
                .then(function(harmonyClient) {
                    harmonyClient.isOff()
                        .then(function(off) {
                            if (!off) {
                                var turnedOff = turnOff(harmonyClient);
                                callback(null, turnedOff);
                            }
                        }).finally(function() {
                            harmonyClient.end();
                        });
                });
        });

        console.log("Listening for triggers...");
    }
};