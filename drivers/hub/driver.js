"use strict";

var HarmonyHubDiscover = require("harmonyhubjs-discover");
var Harmony = require("harmonyhubjs-client");

// Keeps a reference to discover.
var Discover;

// a list of devices, with their 'id' as key
// it is generally advisable to keep a list of
// paired and active devices in your driver's memory.
var Hubs = {};
var Clients = {};

module.exports.init = function(devices_data, callback) {
    // ATHOM: When the driver starts, Homey rebooted. Initialize all previously paired devices.
    console.log("Previously paired " + devices_data.length + " hub(s).");
    //console.log(JSON.stringify(devices_data));

    if (devices_data.length > 0) {
        // Discover hubs currently on the network.
        StartHubDiscovery(function(error, hubs) {
            StopHubDiscovery();

            console.log("Discovered " + hubs.length + " hub(s).");
            //console.log(JSON.stringify(hubs));

            devices_data.forEach(function(device_data) {
                // ATHOM: Do something here to initialise the device, e.g. start a socket connection.
                console.log("Finding previously paired hub with id: " + device_data.id);

                // Find out if this previously paired hub was discovered on the network.
                var hubDiscovered = hubs.some(function(hub) {
                    if (hub.uuid === device_data.id) {
                        // Override previous ipaddress.
                        device_data.ip = hub.ip;
                        return true;
                    } else {
                        return false;
                    }
                });

                if (hubDiscovered) {
                    // Initialize the previously paired hub.
                    InitDevice(device_data);
                } else {
                    console.log("Previously paired hub couldn't be discovered on the network: " +
                        JSON.stringify(device_data));
                }
            });
        });
    }

    // ATHOM: Let Homey know the driver is ready.
    if (callback) callback();
}

module.exports.added = function(device_data, callback) {
    // ATHOM: run when a device has been added by the user (as of v0.8.33)
    InitDevice(device_data);
    callback(null, true);
}

module.exports.renamed = function(device_data, new_name) {
    // ATHOM: run when the user has renamed the device in Homey.
    // It is recommended to synchronize a device's name, so the user is not confused
    // when it uses another remote to control that device (e.g. the manufacturer's app).
}

module.exports.deleted = function(device_data, callback) {
    // ATHOM: run when the user has deleted the device from Homey
    GetClient(device_data.id,
        function(error, client) {
            if (error) {
                console.log("ERROR: " + JSON.stringify(error));
                callback(error, null);
            } else {
                // Stop refreshing the current activity.
                clearInterval(Clients[device_data.id].interval);

                // Disconnect from the hub.
                client.end();
                console.log("Disconnected from device.");
            }
        });

    delete Hubs[device_data.id];
    delete Clients[device_data.id];
    callback(null, true);
}

module.exports.settings = function(device_data, newSettingsObj, oldSettingsObj, changedKeysArr, callback) {
    // ATHOM: see settings
}

module.exports.pair = function(socket) {
    // `socket` is a direct channel to the front-end
    // Note: objects will be JSON stringified, so don't use special object such as Error or Buffer.

    // this method is run when Homey.emit('start') is run on the front-end
    socket.on('start',
        function(data, callback) {
            console.log("Pairing started...");

            // fire the callback (you can only do this once)
            // ( err, result )
            callback(null, 'Started!');

            // send a message to the front-end, even after the callback has fired
            //setTimeout(function () {
            //    socket.emit("hello", "Hello to you!", function (err, result) {
            //        console.log(result); // result is `Hi!`
            //    });
            //}, 2000);
        });

    // this method is run when Homey.emit('list_devices') is run on the front-end
    // which happens when you use the template `list_devices`
    socket.on("list_devices",
        function(data, callback) {
            StartHubDiscovery(function(error, hubs) {
                if (error) {
                    console.log(error);
                    StopHubDiscovery();

                    callback(error, null);
                } else {
                    console.log("Discovered " + hubs.length + " hub(s).");
                    //console.log(JSON.stringify(hubs));

                    StopHubDiscovery();

                    var listOfDevices = [];
                    hubs.forEach(function(hub) {
                        listOfDevices.push(MapHubToDeviceData(hub));
                    });
                    //console.log(JSON.stringify(listOfDevices));

                    // err, result style
                    callback(null, listOfDevices);

                    // TODO: even when we found another device, these can be shown in the front-end
                    //setTimeout(function() {
                    //        socket.emit("list_devices", listOfDevices);
                    //    },
                    //    2000);
                }
            });
        });

    // ATHOM: User aborted pairing, or pairing is finished.
    socket.on("disconnect",
        function() {
            console.log("User aborted pairing, or pairing is finished");
        });
}

module.exports.capabilities = {
    activity: {
        // ATHOM: this function is called by Homey when it wants to GET the current activity, e.g. when the user loads the smartphone interface.
        // `device_data` is the object as saved during pairing.
        // `callback` should return the current value in the format callback( err, value ).
        get: function(device_data, callback) {
            // ATHOM: get the hub with a locally defined function.
            var device = GetHubByData(device_data);
            if (device instanceof Error) return callback(device);

            // ATHOM: send the current activity to Homey.
            callback(null, device.activity.name);
        },

        // ATHOM: this function is called by Homey when it wants to SET the current activity, e.g. when the user says 'watch tv'.
        // `device_data` is the object as saved during pairing.
        // `activity` is the new value.
        // `callback` should return the new value in the format callback( err, value ).
        set: function(device_data, activity, callback) {
            var device = GetHubByData(device_data);
            if (device instanceof Error) return callback(device);

            // TODO: Get the current hub activity.
            var currentActivity = null;

            // ATHOM: Set the new activity, only when if differs from the current.
            if (currentActivity !== activity) {
                // TODO: Set the new activity here.
                module.exports.realtime(device_data, 'activity', activity);
                updateHub(device_data.id);
            }

            // TODO: Refresh the current hub activity.
            currentActivity = null;

            // ATHOM: send the new activity value to Homey.
            callback(null, currentActivity);
        }
    }
}

module.exports.autocompleteActivity = function(args, callback) {
    if (args.query.length > 0) {
        console.log("Finding activity '" + args.query + "' on " + args.args.hub.ip + "...");
    } else {
        console.log("Finding activities on " + args.args.hub.ip + "...");
    }

    GetClient(args.args.hub.id,
        function(error, client) {
            if (error) {
                console.log("ERROR: " + JSON.stringify(error));
                callback(error, null);
            } else {
                client.getActivities()
                    .then(function(activities) {
                            var listOfActivities = [];
                            activities.forEach(function(activity) {
                                if (activity.isAVActivity &&
                                (args.query.length === 0 ||
                                    activity.label.toUpperCase().indexOf(args.query.toUpperCase()) !== -1)) {
                                    activity.name = activity.label;
                                    activity.icon = activity.baseImageUri + activity.imageKey;
                                    activity.hub = args.args.hub;
                                    listOfActivities.push(activity);
                                }
                            });
                            callback(null, listOfActivities.sortBy("activityOrder"));
                        },
                        function(error) {
                            console.log("Get activities failed: ");
                            console.log(JSON.stringify(error));
                            callback(error, null);
                        });
            }
        });
};

module.exports.autocompleteDevice = function(args, callback) {
    if (args.query.length > 0) {
        console.log("Finding device '" + args.query + "' on " + args.args.hub.ip + "...");
    } else {
        console.log("Finding device on " + args.args.hub.ip + "...");
    }

    GetClient(args.args.hub.id,
        function(error, client) {
            if (error) {
                console.log("ERROR: " + JSON.stringify(error));
                callback(error, null);
            } else {
                GetDevices(client,
                    function(devices) {
                        var listOfDevices = [];
                        devices.forEach(function(device) {
                            if ((args.query.length === 0 ||
                                device.label.toUpperCase().indexOf(args.query.toUpperCase()) !== -1)) {
                                listOfDevices.push(device);
                            }
                        });
                        callback(null, listOfDevices.sortBy("name"));
                    });
            }
        });
};

module.exports.startActivity = function (args, callback) {
    console.log("Starting activity '" + args.activity.name + "' on " + args.hub.ip + "...");

    GetClient(args.hub.id,
        function(error, client) {
            if (error) {
                console.log("ERROR: " + JSON.stringify(error));
                callback(error, null);
            } else {
                client.isOff()
                    .then(function(off) {
                            if (off) {
                                console.log("- Hub status: off");
                                console.log("Starting activity...");
                                StartActivity(function(error, started) {
                                        if (error) {
                                            console.log("Starting activity failed: ");
                                            console.log(JSON.stringify(error));
                                            callback(error, null);
                                        } else {
                                            callback(null, started);
                                        }
                                    },
                                    client,
                                    args.activity.id);
                            } else {
                                console.log("- Hub status: on");
                                client.getCurrentActivity()
                                    .then(function(currentActivityId) {
                                            console.log("Current activity id: " + currentActivityId);
                                            console.log("Requested activity id: " + args.activity.id);
                                            if (currentActivityId !== args.activity.id) {
                                                console.log("Switching activity...");
                                                StartActivity(function(error, started) {
                                                        if (error) {
                                                            console.log("Switching activity failed: ");
                                                            console.log(JSON.stringify(error));
                                                            callback(error, null);
                                                        } else {
                                                            callback(null, started);
                                                        }
                                                    },
                                                    client,
                                                    args.activity.id);
                                            } else {
                                                console.log("Requested activity already selected.");
                                                callback(null, true);
                                            }
                                        },
                                        function(error) {
                                            console.log("Get current activity failed: ");
                                            console.log(JSON.stringify(error));
                                            callback(error, null);
                                        });
                            }
                        },
                        function(error) {
                            console.log("Unable to determine client state: ");
                            console.log(JSON.stringify(error));
                            callback(error, null);
                        });
            }
        });
};

module.exports.sendCommandToDevice = function (args, callback) {
    console.log("Sending command to " + args.hub.ip + "...");

    GetClient(device_data_id,
        function(error, client) {
            if (error) {
                console.log("ERROR: " + JSON.stringify(error));
                callback(error, null);
            } else {
                var actionSent = SendAction(client, args.action.action);
                callback(null, actionSent);
            }
        });
};

module.exports.allOff = function(args, callback) {
    console.log("Turning all devices off on " + args.hub.ip + "...");

    GetClient(args.hub.id,
        function(error, client) {
            if (error) {
                callback(error, null);
            } else {
                client.isOff()
                    .then(function (off) {
                        if (!off) {
                            var turnedOff = TurnOff(client);
                            callback(null, turnedOff);
                        }
                    },
                    function (error) {
                        console.log("Unable to determine client state: ");
                        console.log(JSON.stringify(error));
                        callback(error, null);
                    });
            }
        });
};

// ATHOM: a helper method to get a device from the devices list by it's device_data object.
function GetHubByData(device_data) {
    var device = Hubs[device_data.id];
    if (typeof device === 'undefined') {
        return new Error("invalid_device");
    } else {
        return device;
    }
}

function GetCurrentActivityId(device_data_id, callback) {
    GetClient(device_data_id,
        function(error, client) {
            if (error) {
                console.log("ERROR: " + JSON.stringify(error));
                callback(error, null);
            } else {
                if (!client) {
                    console.log("Client offline, retrying later...");
                } else {
                    console.log("Client found, getting current state...");
                    client.isOff()
                        .then(function(off) {
                                if (off) {
                                    console.log("Client turned off");
                                    callback(null, null);
                                } else {
                                    console.log("Client turned on, getting current activity...");
                                    client.getCurrentActivity()
                                        .then(function(currentActivityId) {
                                                callback(null, currentActivityId);
                                            },
                                            function(error) {
                                                console.log("Get current activity failed: ");
                                                console.log(JSON.stringify(error));
                                                callback(error, null);
                                            });
                                }
                            },
                            function(error) {
                                console.log("Getting device state failed: ");
                                console.log(JSON.stringify(error));
                                callback(error, null);
                            });
                }
            }
        });
}

function GetActivityName(device_data_id, activityId, callback) {
    GetClient(device_data_id,
        function(error, client) {
            if (error) {
                console.log("ERROR: " + JSON.stringify(error));
                callback(error, null);
            } else {
                client.isOff()
                    .then(function(off) {
                            if (off) {
                                callback(null, null);
                            } else {
                                client.getActivities()
                                    .then(function(activities) {
                                            activities.forEach(function(activity) {
                                                if (activity.id === activityId) {
                                                    if (callback) callback(null, activity.label);
                                                }
                                            });
                                        },
                                        function(error) {
                                            console.log("Get activities failed: ");
                                            console.log(JSON.stringify(error));
                                            callback(error, null);
                                        });
                            }
                        },
                        function(error) {
                            console.log("Getting device state failed: ");
                            console.log(JSON.stringify(error));
                            callback(error, null);
                        });
            }
        });
}

// ATHOM: a helper method to add a device to the devices list.
function InitDevice(device_data) {
    console.log("Initializing device...");
    //console.log(JSON.stringify(device_data));

    // Add hub to list of devices.
    Hubs[device_data.id] = {};
    Hubs[device_data.id].data = device_data;
    Clients[device_data.id] = {};
    Clients[device_data.id].ip = device_data.ip;

    console.log("Device and client initialized. Connecting...");

    // Open a connection to the hub and get the current hub activity.
    Harmony(device_data.ip)
        .then(function(harmonyClient) {
                console.log("Connected to device.");

                harmonyClient._xmppClient.on("error",
                    function (e) {
                        console.log("Client for hub " + device_data.id + " reported an error: ", e);
                    });

                harmonyClient._xmppClient.on("offline",
                    function () {
                        console.log("Client for hub " + device_data.id + " went offline. Re-establishing in 10 seconds...");

                        // Stop refreshing the current activity on the disconnected client.
                        clearInterval(Clients[device_data.id].interval);

                        // Re-establish connection in 10 seconds.
                        setTimeout(function () { InitDevice(device_data); }, 10000);
                    });

                harmonyClient.on("stateDigest",
                    function(stateDigest) {
                        console.log("Got state digest: " + JSON.stringify(stateDigest));
                    });

                Clients[device_data.id].client = harmonyClient;
                // Schedule refresh of current activity every 5 seconds.
                Clients[device_data.id]
                    .interval = setInterval(function() { RefreshCurrentDeviceActivity(device_data.id); }, 5000);

                harmonyClient.isOff()
                    .then(function(off) {
                            if (off) {
                                console.log("- Hub status: off");
                            } else {
                                console.log("- Hub status: on");
                                GetCurrentActivityId(device_data.id,
                                    function(error, currentActivityId) {
                                        if (currentActivityId) {
                                            GetActivityName(device_data.id,
                                                currentActivityId,
                                                function(error, activityName) {
                                                    console.log("Current activity name: " + activityName);
                                                    Hubs[device_data.id]
                                                        .activity = { id: currentActivityId, name: activityName };
                                                });
                                        } else {
                                            Hubs[device_data.id].activity = null;
                                        }
                                    },
                                    function(error) {
                                        console.log("Get current activity failed: ");
                                        console.log(JSON.stringify(error));
                                    });
                            }
                        },
                        function(error) {
                            console.log("Unable to determine client state: ");
                            console.log(JSON.stringify(error));
                        });
            },
            function(error) {
                console.log("Connecting to hub failed: ");
                console.log(JSON.stringify(error));
            });
}

function RefreshCurrentDeviceActivity(deviceDataId) {
    var device = Hubs[deviceDataId];
    console.log("Refreshing current activity for device " + deviceDataId + "...");
    GetCurrentActivityId(deviceDataId,
        function(error, currentActivityId) {
            console.log("Previous activity: " + JSON.stringify(Hubs[deviceDataId].activity));
            console.log("Current activity id: " + currentActivityId);
            if (device.activity) {
                // Change from one activity...
                if (device.activity.id !== currentActivityId) {
                    if (currentActivityId) {
                        // ... to another activity.
                        GetActivityName(deviceDataId,
                            currentActivityId,
                            function(error, activityName) {
                                device.activity = { id: currentActivityId, name: activityName };
                                // Emit capability change event.
                                Homey.manager("flow").trigger("activity_changed", { activity: activityName });
                                console.log("Activity changed: " + activityName);
                                //module.exports.realtime(Devices[deviceDataId].data, "activity", activity);
                            });
                    } else {
                        // ... device was turned off.
                    }
                } else {
                    if (!device.activity && currentActivityId) {
                        // Turned on.
                    }
                }
            } else {
                if (currentActivityId) {
                    // Device was turned on.
                    GetActivityName(deviceDataId,
                        currentActivityId,
                        function(error, activityName) {
                            device.activity = { id: currentActivityId, name: activityName };
                            // Emit capability change event.
                            Homey.manager("flow").trigger("activity_changed", { activity: activityName });
                            console.log("Activity changed: " + activityName);
                            //module.exports.realtime(Devices[deviceDataId].data, "activity", activity);
                        });
                }
            }
        },
        function(error) {
            console.log("Get current activity failed: ");
            console.log(JSON.stringify(error));
        });
}

function MapHubToDeviceData(hub) {
    return {
        name: hub.friendlyName,
        data: {
            // this data object is saved to- and unique for the device. It is passed on the get and set functions as 1st argument
            id: hub.uuid, // something unique, so your driver knows which physical device it is. A MAC address or Node ID, for example. This is required
            name: hub.host_name,
            friendlyName: hub.friendlyName,
            ip: hub.ip
        },
        //capabilities: [ "activity" ]
    };
}

/**
* Initializes hub discovery.
* 
* @returns {} 
*/
function StartHubDiscovery(callback) {

    var listOfHubs = [];

    function hubInList(uuid) {
        return listOfHubs.some(function(hub) {
            return hub.uuid === uuid;
        });
    }

    Discover = new HarmonyHubDiscover(61991);

    //discover.on("online",
    //    function(hub) {
    //    // Triggered when a new hub was found.

    //    // Log IP address of hub we found.
    //        console.log("online: " + hub.ip);
    //        console.log(JSON.stringify(hub));

    //        if (!hubInList(hub.ip)) {
    //            listOfHubs.push(hub);
    //            if (callback) callback(null, listOfHubs);
    //        }
    //    });

    Discover.on("update",
        function(hubs) {
            // Combines the online & update events by returning an array with all known hubs for ease of use.
            hubs.forEach(function(hub) {
                if (!hubInList(hub.uuid)) {
                    listOfHubs.push(hub);
                }
            });

            if (callback) callback(null, listOfHubs);
        });

    console.log("Discovering hubs...");
    Discover.start();
}

/**
* Stops listening for Hubs on the network.
* 
* @returns {} 
*/
function StopHubDiscovery() {
    if (Discover) {
        Discover.stop();
    }

    console.log("Stopped listening for hubs.");
}

/**
 * Gets a list of devices, returned through the specified callback method.
 * 
 * @param {} client 
 * @param {} callback 
 * @returns {} 
 */
function GetDevices(client, callback) {
    client.getAvailableCommands()
        .then(function(commands) {
                var listOfDevices = [];
                commands.device.forEach(function(device) {
                    console.log("Found device " + device.id + ": " + device.label);
                    //device.icon = "";
                    device.name = device.label;
                    device.description = device.model;
                    listOfDevices.push(device);
                });
                if (callback) callback(listOfDevices);
            },
            function(error) {
                console.log("Get devices failed: ");
                console.log(JSON.stringify(error));
                callback(error, null);
            });
}

/**
 * Starts the specified activity through the given harmony client.
 * 
 * @param {} client 
 * @param {} activityName 
 * @returns {} true/false
 */
function StartActivity(callback, client, activityId) {
    client.getActivities()
        .then(function(activities) {
                var started = activities.some(function(activity) {
                    if (activity.id === activityId) {
                        // Found the activity we want.
                        console.log("Activity '" + activity.label + "' found. Starting...");
                        client.startActivity(activity.id);
                        console.log("Activity '" + activity.label + "' started.");
                        return true;
                    } else {
                        return false;
                    }
                });

                callback(null, started);
            },
            function(error) {
                console.log("Get activities failed: ");
                console.log(JSON.stringify(error));
                callback(error, null);
            });
}

/**
 * Sends the specified command through the given harmony client.
 * 
 * @param {} client 
 * @param {} action 
 * @returns {} true/false 
 */
function SendAction(client, action) {
    var encodedAction = action.replace(/\:/g, "::");
    client.send("holdAction", "action=" + encodedAction + ":status=press");
    console.log("Action sent.");
    return true;
}

/**
 * Turns off all devices through the given harmony client.
 * 
 * @param {} harmonyClient 
 * @returns {} true/false
 */
function TurnOff(client) {
    client.turnOff();
    console.log("All devices turned off.");
    return true;
}

function GetClient(hubId, callback) {
    var client = null;
    var clientStruct = Clients[hubId];
    var error = clientStruct ? null : "Hub with Id '" + hubId + "' not found. Disconnected?";
    if (!error) {
        client = clientStruct.client;
    }

    callback(error, client);
};

Array.prototype.sortBy = function (p) {
    return this.slice(0).sort(function (a, b) {
        return (a[p] > b[p]) ? 1 : (a[p] < b[p]) ? -1 : 0;
    });
}