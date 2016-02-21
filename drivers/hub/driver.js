"use strict";
var HarmonyHubDiscover = require("harmonyhubjs-discover");
var listOfHubs = [];
var discover;

module.exports.pair = function(socket) {
    socket.on("list_devices", function(data, callback) {
        startHubDiscovery(callback);
    });

    socket.on("disconnect", function() {
        stopHubDiscovery();
    });

    function mapHubsToDevices(hubs) {
        var devices = [];

        hubs.forEach(function(hub) {
            devices.push({
                name: hub.friendlyName,
                data: {
                    id: hub.ip,
                    ipaddress: hub.ip
                }
            });
        });

        return devices;
    }

    /**
     * Initializes hub discovery.
     * 
     * @returns {} 
     */
    function startHubDiscovery(callback) {

        function hubInList(ipaddress) {
            return listOfHubs.some(function(hub) {
                return hub.ip === ipaddress;
            });
        }

        discover = new HarmonyHubDiscover(61991);

        discover.on("online", function(hub) {
            // Triggered when a new hub was found
            console.log("online: " + hub.ip);
            if (!hubInList(hub.ip)) {
                listOfHubs.push(hub);
                if (callback) callback(null, mapHubsToDevices([hub]));
            }
        });

        discover.on("update", function(hubs) {
            // Combines the online & update events by returning an array with all known hubs for ease of use.
            var hubIps = hubs.reduce(function(prev, hub) {
                return prev + (prev.length > 0 ? ", " : "") + hub.ip;
            }, "");
            console.log("update: " + hubIps);

            hubs.forEach(function(hub) {
                if (!hubInList(hub.ip)) {
                    listOfHubs.push(hub);
                    socket.emit("list_devices", mapHubsToDevices([hub]));
                }
            });
        });

        discover.start();

        console.log("Listening for hubs...");
    }

    /**
     * Stops listening for Hubs on the network.
     * 
     * @returns {} 
     */
    function stopHubDiscovery() {
        if (discover) {
            discover.stop();
        }

        console.log("Stopped listening for hubs.");
    }
}