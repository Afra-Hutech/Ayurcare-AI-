const { MongoClient } = require('mongodb');

async function checkReports() {
    const uri = "mongodb+srv://doc-connect:doc-connect@doc-connect.mpev56u.mongodb.net/doctor_portal?retryWrites=true&w=majority&appName=doc-connect&ssl=true&tlsInsecure=true";
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const database = client.db('doctor_portal');
        const reports = database.collection('reports');

        // Find the 5 most recent reports
        const recentReports = await reports.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .toArray();

        console.log("Recent Reports:");
        recentReports.forEach((report, index) => {
            console.log(`\n--- Report ${index + 1} ---`);
            console.log(`ID: ${report._id}`);
            console.log(`Diagnosis: ${JSON.stringify(report.diagnosis, null, 2)}`);
            console.log(`User ID: ${report.userId}`);
            console.log(`Created At: ${report.createdAt}`);
            // Check for the .name property specifically if it's an object
            if (report.diagnosis && typeof report.diagnosis === 'object') {
                console.log(`Diagnosis Name Property: ${report.diagnosis.name}`);
            }
        });

    } catch (error) {
        console.error("Error connecting to MongoDB:", error);
    } finally {
        await client.close();
    }
}

checkReports();
