exports.initialize = async () => {
    // Replace this with actual DB init logic
    return new Promise(resolve => {
        setTimeout(() => {
            console.log("Database connected!");
            resolve();
        }, 500);
    });
};
