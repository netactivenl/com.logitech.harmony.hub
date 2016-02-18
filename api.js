module.exports = [
    {
        description: "Update settings",
        method: "PUT",
        path: "/settings/",
        fn: function(callback, args) {
            Homey.app.updateSettings(args.body, callback);
        }
    },
    {
        description: "Get list of discovered Hubs",
        method: "GET",
        path: "/hubs/",
        fn: function(callback, args) {
            Homey.app.getListOfHubs(callback);
        }
    }
];