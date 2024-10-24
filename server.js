const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const WebSocket = require('ws');
const cors = require('cors');

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');


const app = express();
app.use(bodyParser.json());
app.use(cors());

// Connexion à MongoDB
const dbURI = 'mongodb+srv://contact:aPD3C1yQaSvupbhv@thierryparadis.lgbrr.mongodb.net/mydatabase?retryWrites=true&w=majority&appName=ThierryParadis';

// Connexion à la base de données
mongoose.connect(dbURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => {
    console.log('Connexion réussie à la base de données MongoDB');
})
.catch((error) => {
    console.error('Erreur de connexion à la base de données MongoDB:', error);
});
// Schéma pour les jours d'ouverture
const openDaysSchema = new mongoose.Schema({
    daysOpen: { type: [String], required: true }, // Exemple: ['Monday', 'Tuesday']
    timeSlotDuration: { type: Number, required: true }, // Durée des créneaux en minutes
    hours: [{ day: String, openingTime: String, closingTime: String }], // Heures d'ouverture par jour
    seasonMode: { type: String, enum: ['summer', 'winter'], required: true } // Mode saisonnier
});

// Schéma pour les dates fermées
const closedDatesSchema = new mongoose.Schema({
    dates: [
        {
            date: { type: Date }, // Fermeture d'une date unique
            startDate: { type: Date }, // Début de la plage de dates
            endDate: { type: Date },  // Fin de la plage de dates
            isRecurring: { type: Boolean, default: false } // Fermeture récurrente
        }
    ]
});

const OpenDays = mongoose.model('OpenDays', openDaysSchema);
const ClosedDates = mongoose.model('ClosedDates', closedDatesSchema);


// Schéma utilisateur
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
});

const User = mongoose.model('User', userSchema);

// Méthode pour créer un compte
app.post('/register', async (req, res) => {
    const { username, password } = req.body;

    try {
        // Vérifier si l'utilisateur existe déjà
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ message: 'Utilisateur déjà existant' });
        }

        // Hacher le mot de passe
        const hashedPassword = await bcrypt.hash(password, 10);

        // Créer un nouvel utilisateur
        const newUser = new User({ username, password: hashedPassword });
        await newUser.save();

        res.status(201).json({ message: 'Utilisateur créé avec succès' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la création de l’utilisateur', error });
    }
});

// Méthode pour se connecter
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        // Vérifier si l'utilisateur existe
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ message: 'Nom d’utilisateur ou mot de passe incorrect' });
        }

        // Vérifier le mot de passe
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Nom d’utilisateur ou mot de passe incorrect' });
        }

        // Créer un token JWT
        const token = jwt.sign({ id: user._id }, 'your_jwt_secret', { expiresIn: '1h' });
        res.status(200).json({ message: 'Connexion réussie', token });
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la connexion', error });
    }
});

// Route pour définir les jours d'ouverture et les créneaux horaires
app.post('/admin/open-days', async (req, res) => {
    const { daysOpen, timeSlotDuration, hours, seasonMode } = req.body;

    try {
        let openDays = await OpenDays.findOne();
        if (openDays) {
            openDays.daysOpen = daysOpen;
            openDays.timeSlotDuration = timeSlotDuration;
            openDays.hours = hours; // Ajout des heures d'ouverture
            openDays.seasonMode = seasonMode;
            await openDays.save();
        } else {
            openDays = new OpenDays({ daysOpen, timeSlotDuration, hours, seasonMode });
            await openDays.save();
        }
        res.json({ message: 'Jours ouverts et créneaux horaires définis avec succès.' });
    } catch (error) {
        console.error('Erreur lors de la définition des jours ouverts:', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

// Route pour récupérer les jours d'ouverture
app.get('/admin/open-days', async (req, res) => {
    try {
        const openDays = await OpenDays.findOne();
        if (!openDays) {
            return res.status(404).json({ message: 'Aucune information sur les jours ouverts trouvée.' });
        }
        res.json(openDays);
    } catch (error) {
        console.error('Erreur lors de la récupération des jours ouverts:', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
});


app.get('/admin/close-dates', async (req, res) => {
    try {
        const closedDatesEntries = await ClosedDates.find(); // Récupérer toutes les entrées de dates fermées
        res.json(closedDatesEntries); // Retourner les dates fermées au client
    } catch (error) {
        console.error('Erreur lors de la récupération des dates fermées:', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

// Route pour ajouter des dates fermées
app.post('/admin/close-dates', async (req, res) => {
    const { closedDates } = req.body; // Exemple: [{ date: '2024-12-25' }, { startDate: '2024-12-26', endDate: '2024-12-31' }]

    try {
        let closedDatesEntry = new ClosedDates({ dates: closedDates });
        await closedDatesEntry.save();
        res.json({ message: 'Dates fermées ajoutées avec succès.' });
    } catch (error) {
        console.error('Erreur lors de l\'ajout des dates fermées:', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
});
// Route pour modifier une date fermée
app.put('/admin/close-dates/:id', async (req, res) => {
    const { id } = req.params;
    const { oldDate, newDate, oldStartDate, oldEndDate, newStartDate, newEndDate } = req.body;

    try {
        // Trouver l'entrée de dates fermées par ID
        const closedDateEntry = await ClosedDates.findById(id);
        if (!closedDateEntry) {
            return res.status(404).json({ message: 'Date fermée non trouvée.' });
        }

        let dateUpdated = false;

        // Modifier une date unique si oldDate est fourni
        if (oldDate && newDate) {
            closedDateEntry.dates = closedDateEntry.dates.map(item => {
                if (item.date && item.date.toISOString().slice(0, 10) === oldDate) {
                    item.date = new Date(newDate); // Mettre à jour la date unique
                    dateUpdated = true;
                }
                return item;
            });
        }

        // Modifier une plage de dates si oldStartDate et oldEndDate sont fournis
        if (oldStartDate && oldEndDate && newStartDate && newEndDate) {
            closedDateEntry.dates = closedDateEntry.dates.map(item => {
                if (item.startDate && item.endDate &&
                    item.startDate.toISOString().slice(0, 10) === oldStartDate &&
                    item.endDate.toISOString().slice(0, 10) === oldEndDate) {
                    item.startDate = new Date(newStartDate); // Mettre à jour la startDate
                    item.endDate = new Date(newEndDate); // Mettre à jour la endDate
                    dateUpdated = true;
                }
                return item;
            });
        }

        // Vérifier si une date ou une plage a été modifiée
        if (!dateUpdated) {
            return res.status(404).json({ message: 'Date ou plage de dates à modifier non trouvée.' });
        }

        await closedDateEntry.save(); // Sauvegarder les modifications

        res.json({ message: 'Date ou plage de dates modifiée avec succès.' });
    } catch (error) {
        console.error('Erreur lors de la modification des dates fermées:', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
});


// Route pour supprimer une date fermée
app.delete('/admin/close-dates/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const deletedDate = await ClosedDates.findByIdAndDelete(id);
        if (!deletedDate) {
            return res.status(404).json({ message: 'Date fermée non trouvée.' });
        }

        res.json({ message: 'Date fermée supprimée avec succès.' });
    } catch (error) {
        console.error('Erreur lors de la suppression des dates fermées:', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
});



// Mise à jour du modèle de rendez-vous
const appointmentSchema = new mongoose.Schema({
    firstName: String,
    lastName: String,
    phoneNumber: String,
    age: Number,
    reason: String,
    date: String,  // Format YYYY-MM-DD
    timeSlot: String, // Format HH:MM
    status: { type: String, enum: ['planifié', 'appeler', 'en cours', 'terminé'], default: 'planifié' }
});

const Appointment = mongoose.model('Appointment', appointmentSchema);



// WebSocket setup
const server = app.listen(3000, () => {
    console.log('Serveur en cours d\'exécution sur le port 3000');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    console.log('Client connecté');

    ws.on('close', () => {
        console.log('Client déconnecté');
    });
});

// Envoie une mise à jour des rendez-vous à tous les clients connectés
const notifyAppointmentUpdate = () => {
    const message = JSON.stringify({ type: 'appointmentUpdate' });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
};

// Envoie un message d'appel à tous les clients connectés
const notifyCall = (appointment) => {
    const message = JSON.stringify({
        type: 'call',
        appointment: {
            _id: appointment._id,
            firstName: appointment.firstName,
            lastName: appointment.lastName,
            phoneNumber: appointment.phoneNumber
        }
    });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
};

// Route pour obtenir les créneaux restants disponibles pour aujourd'hui et demain si demain est ouvert et dans la même semaine
// Fonction utilitaire pour générer les créneaux horaires dynamiques
async function isDateClosed(date) {
    try {
        // Récupère toutes les dates fermées depuis la base de données
        const closedDatesList = await ClosedDates.find();

        // Si aucune date fermée n'a été trouvée
        if (!closedDatesList || closedDatesList.length === 0) {
            console.log("Aucune date fermée trouvée.");
            return false;
        }

        // Formatage de la date donnée à vérifier (YYYY-MM-DD)
        const formattedDate = date.toISOString().split('T')[0];
        console.log("Date actuelle formatée:", formattedDate);

        // Parcours de chaque élément des dates fermées
        for (const closedDates of closedDatesList) {
            for (const closedDate of closedDates.dates) {

                // Vérifie si la date simple est fermée
                if (closedDate.date) {
                    const closedDateFormatted = new Date(closedDate.date).toISOString().split('T')[0];
                    console.log(`Comparaison: ${formattedDate} === ${closedDateFormatted}`);
                    if (closedDateFormatted === formattedDate) {
                        return true; // Date fermée
                    }
                }

                // Vérifie si une plage de dates est fermée
                if (closedDate.startDate && closedDate.endDate) {
                    const startDateFormatted = new Date(closedDate.startDate).toISOString().split('T')[0];
                    const endDateFormatted = new Date(closedDate.endDate).toISOString().split('T')[0];
                    console.log(`Comparaison entre ${formattedDate} et la plage ${startDateFormatted} - ${endDateFormatted}`);
                    if (formattedDate >= startDateFormatted && formattedDate <= endDateFormatted) {
                        return true; // Date fermée pendant une plage de dates
                    }
                }

                // Si aucune date ou plage n'est spécifiée
                if (!closedDate.date && !closedDate.startDate && !closedDate.endDate) {
                    console.log("Aucune date valide pour cet élément.");
                }
            }
        }

        // Si aucune date fermée n'est trouvée
        return false;

    } catch (error) {
        console.error("Erreur lors de la vérification des dates fermées:", error);
        return false;
    }
}






// Fonction pour générer des créneaux horaires en vérifiant si le jour est fermé
async function generateTimeSlotsForDay(date, openingTime, closingTime, timeSlotDuration) {
    const isClosed = await isDateClosed(date);

    if (isClosed) {
        console.log('Le jour est fermé, aucun créneau ne sera généré.');
        return [];
    }

    const [openHour, openMinute] = openingTime.split(':').map(Number);
    const [closeHour, closeMinute] = closingTime.split(':').map(Number);
    let slots = [];

    let currentHour = openHour;
    let currentMinute = openMinute;

    while (currentHour < closeHour || (currentHour === closeHour && currentMinute < closeMinute)) {
        const time = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;
        slots.push(time);

        currentMinute += timeSlotDuration;
        if (currentMinute >= 60) {
            currentHour += 1;
            currentMinute -= 60;
        }
    }

    return slots;
}
app.get('/available-slots-today', async (req, res) => {
    const today = new Date();
    const currentDay = today.getDay(); // 0 (Dimanche) à 6 (Samedi)
    const currentDate = today.toISOString().split('T')[0]; // Format YYYY-MM-DD
    const currentTime = today.getHours() * 60 + today.getMinutes(); // Temps actuel en minutes depuis 00:00

    console.log("Date d'aujourd'hui:", today);
    console.log("Jour actuel (index):", currentDay);
    console.log("Date formatée:", currentDate);
    console.log("Heure actuelle en minutes:", currentTime);

    // Récupérer la configuration des jours ouverts et des créneaux horaires
    const openDays = await OpenDays.findOne();
    if (!openDays) {
        console.log("Aucune configuration des jours ouverts trouvée.");
        return res.status(404).json({ message: 'Jours ouverts non définis.' });
    }
    const { daysOpen, timeSlotDuration, hours } = openDays;

    console.log("Configuration des jours ouverts récupérée:", openDays);

    // Trouver les heures d'ouverture pour aujourd'hui en utilisant le français
    const todayDayName = getDayName(currentDay, 'fr'); // Changez ici 'fr' ou 'en' selon vos besoins
    console.log("Nom du jour actuel:", todayDayName);
    const todayHours = hours.find(hour => todayDayName === hour.day);

    console.log("Heures d'ouverture aujourd'hui:", todayHours);

    if (!todayHours || !todayHours.openingTime || !todayHours.closingTime) {
        console.log("Pas d'horaires d'ouverture trouvés pour aujourd'hui.");
        return res.status(404).json({ message: 'Pas d\'horaires définis pour aujourd\'hui.' });
    }

    // Vérifier si aujourd'hui est un jour fermé
    const isClosedToday = await isDateClosed(today);
    console.log("Est-ce que aujourd'hui est fermé:", isClosedToday);

    if (isClosedToday) {
        console.log("Aujourd'hui est fermé, pas de créneaux disponibles.");
        return res.json({
            today: [],
            tomorrow: []
        });
    }

    // Récupérer les rendez-vous pour aujourd'hui
    const appointmentsToday = await Appointment.find({ date: currentDate });
    const bookedSlotsToday = appointmentsToday.map(a => a.timeSlot);

    console.log("Rendez-vous réservés pour aujourd'hui:", bookedSlotsToday);

    // Générer les créneaux horaires pour aujourd'hui
    const allSlotsToday = await generateTimeSlotsForDay(today, todayHours.openingTime, todayHours.closingTime, timeSlotDuration);
    const availableSlotsToday = allSlotsToday.filter(slot => {
        const [hours, minutes] = slot.split(':').map(Number);
        const slotTime = hours * 60 + minutes;
        return slotTime > currentTime && !bookedSlotsToday.includes(slot);
    });

    console.log("Créneaux disponibles aujourd'hui:", availableSlotsToday);

    // Préparer les créneaux pour demain
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1); // Passer à demain
    const tomorrowDate = tomorrow.toISOString().split('T')[0];
    const tomorrowDay = tomorrow.getDay();

    console.log("Date de demain:", tomorrow);
    console.log("Jour de demain (index):", tomorrowDay);

    let availableSlotsTomorrow = [];
    const tomorrowDayName = getDayName(tomorrowDay, 'fr'); // Changez ici 'fr' ou 'en' selon vos besoins
    console.log("Nom du jour de demain:", tomorrowDayName);
    const tomorrowHours = hours.find(hour => tomorrowDayName === hour.day);

    console.log("Heures d'ouverture pour demain:", tomorrowHours);

    // Vérifier si demain est un jour fermé
    const isClosedTomorrow = await isDateClosed(tomorrow);
    console.log("Est-ce que demain est fermé:", isClosedTomorrow);

    if (!isClosedTomorrow && tomorrowHours && tomorrowHours.openingTime && tomorrowHours.closingTime) {
        // Récupérer les rendez-vous pour demain
        const appointmentsTomorrow = await Appointment.find({ date: tomorrowDate });
        const bookedSlotsTomorrow = appointmentsTomorrow.map(a => a.timeSlot);

        console.log("Rendez-vous réservés pour demain:", bookedSlotsTomorrow);

        // Générer les créneaux horaires pour demain
        const allSlotsTomorrow = await generateTimeSlotsForDay(tomorrow, tomorrowHours.openingTime, tomorrowHours.closingTime, timeSlotDuration);
        availableSlotsTomorrow = allSlotsTomorrow.filter(slot => !bookedSlotsTomorrow.includes(slot));
        
        console.log("Créneaux disponibles demain:", availableSlotsTomorrow);
    }

    res.json({
        today: availableSlotsToday,
        tomorrow: availableSlotsTomorrow
    });
});

// Fonction utilitaire pour obtenir le nom du jour de la semaine en fonction de la langue
function getDayName(dayIndex, language = 'en') {
    const days = {
        en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        fr: ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
    };

    const dayNames = days[language];
    if (!dayNames) {
        console.error(`Language "${language}" not supported.`);
        return null; // ou gérer l'erreur comme vous le souhaitez
    }

    console.log(`getDayName called with dayIndex: ${dayIndex}, language: ${language}, returns: ${dayNames[dayIndex]}`);
    return dayNames[dayIndex];
}



app.post('/book-appointment', async (req, res) => {
    const { firstName, lastName, phoneNumber, age, date, timeSlot } = req.body;

    // Vérification si tous les champs sont présents
    if (!firstName || !lastName || !phoneNumber || !age || !date || !timeSlot) {
        return res.status(400).json({ message: 'Tous les champs sont obligatoires.' });
    }

    const requestedDate = new Date(date);
    const today = new Date();

    // Obtenez le jour de la semaine pour la date demandée
    const dayOfWeek = getDayName(requestedDate.getDay());  // Utilisation de la fonction utilitaire
    console.log('Jour de la semaine demandé:', dayOfWeek); // Log du jour demandé

    // Récupérez les jours d'ouverture
    const openDays = await OpenDays.findOne();
    if (!openDays) {
        return res.status(400).json({ message: 'Les jours ouverts ne sont pas définis.' });
    }

    console.log('Jours d\'ouverture:', openDays.daysOpen); // Log des jours ouverts

    // Vérifiez si la date demandée est aujourd'hui ou demain
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const isToday = requestedDate.toDateString() === today.toDateString();
    const isTomorrow = requestedDate.toDateString() === tomorrow.toDateString();

    console.log('Est-ce aujourd\'hui?', isToday);
    console.log('Est-ce demain?', isTomorrow);

    const isTodayOrTomorrow = isToday || isTomorrow;

    // Vérifiez que le jour est un jour d'ouverture (sans tenir compte des majuscules/minuscules)
    const lowerCaseOpenDays = openDays.daysOpen.map(day => day.toLowerCase());
    if (!isTodayOrTomorrow || !lowerCaseOpenDays.includes(dayOfWeek.toLowerCase())) {
        return res.status(400).json({ message: `Vous ne pouvez réserver que pour ${openDays.daysOpen.join(', ')}.` });
    }

    // Vérification si le créneau est déjà pris
    const appointmentExists = await Appointment.findOne({ date, timeSlot });
    if (appointmentExists) {
        return res.status(400).json({ message: 'Le créneau est déjà pris.' });
    }

    // Création du rendez-vous
    const newAppointment = new Appointment({
        firstName,
        lastName,
        phoneNumber,
        age,
        date,
        timeSlot
    });

    await newAppointment.save();

    // Notifie les clients de la mise à jour
    notifyAppointmentUpdate();

    res.json({ message: 'Rendez-vous pris avec succès.' });
});








// Route pour changer le statut du rendez-vous
app.patch('/appointments/:id/status', async (req, res) => {
    const { status } = req.body; // Attendez-vous à recevoir un nouveau statut dans le corps de la requête

    // Vérifiez si le statut est valide
    const validStatuses = ['planifié', 'appeler', 'en cours', 'terminé'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: 'Statut invalide' });
    }

    try {
        // Si le nouveau statut est "appeler", mettez à jour le rendez-vous précédent
        if (status === 'appeler') {
            // Trouvez le dernier rendez-vous en cours
            const previousAppointment = await Appointment.findOne({ status: 'en cours' }).sort({ _id: -1 }); // Tri par ID décroissant pour obtenir le plus récent

            if (previousAppointment) {
                // Mettez à jour le statut du rendez-vous précédent
                await Appointment.findByIdAndUpdate(previousAppointment._id, { status: 'terminé' });
            }
        }

        // Mettez à jour le statut du rendez-vous actuel
        const appointment = await Appointment.findByIdAndUpdate(
            req.params.id,
            { status },
            { new: true } // Retourne le document mis à jour
        );

        if (!appointment) {
            return res.status(404).json({ message: 'Rendez-vous non trouvé' });
        }

        res.status(200).json(appointment); // Retourne le rendez-vous mis à jour
    } catch (error) {
        console.error('Erreur lors de la mise à jour du statut:', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

app.get('/appointments-today', async (req, res) => {
    const today = new Date();
    const currentDate = today.toISOString().split('T')[0]; // Format YYYY-MM-DD

    try {
        // Récupérer tous les rendez-vous de la journée actuelle
        const appointments = await Appointment.find({ date: currentDate });

        if (appointments.length === 0) {
            return res.status(404).json({ message: 'Aucun rendez-vous pour aujourd\'hui.' });
        }

        // Retourner les rendez-vous trouvés
        res.json(appointments);
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la récupération des rendez-vous.' });
    }
});
app.put('/appointments/:id/status', async (req, res) => {
    const { status } = req.body; // Attendez-vous à recevoir un nouveau statut dans le corps de la requête

    // Vérifiez si le statut est valide
    const validStatuses = ['planifié', 'appeler', 'en cours', 'terminé'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: 'Statut invalide' });
    }

    try {
        // Si le nouveau statut est "appeler", mettez à jour le rendez-vous précédent
        if (status === 'appeler') {
            // Trouvez le dernier rendez-vous en cours
            const previousAppointment = await Appointment.findOne({ status: 'en cours' }).sort({ _id: -1 }); // Tri par ID décroissant pour obtenir le plus récent

            if (previousAppointment) {
                // Mettez à jour le statut du rendez-vous précédent
                await Appointment.findByIdAndUpdate(previousAppointment._id, { status: 'terminé' });
            }

            // Envoyer une notification d'appel
            await notifyCall(await Appointment.findById(req.params.id)); // Envoyer les détails du rendez-vous actuel
        }

        // Mettez à jour le statut du rendez-vous actuel
        const appointment = await Appointment.findByIdAndUpdate(
            req.params.id,
            { status },
            { new: true } // Retourne le document mis à jour
        );

        if (!appointment) {
            return res.status(404).json({ message: 'Rendez-vous non trouvé' });
        }

        // Envoyer un message via WebSocket pour notifier les clients du changement
        notifyAppointmentUpdate(appointment);

        res.status(200).json(appointment); // Retourne le rendez-vous mis à jour
    } catch (error) {
        console.error('Erreur lors de la mise à jour du statut:', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

// Route pour récupérer tous les patients
app.get('/patients', async (req, res) => {
    try {
        const patients = await Appointment.find(); // Récupère tous les patients de la base de données
        res.status(200).json(patients); // Retourne les données au format JSON
    } catch (error) {
        console.error('Erreur lors de la récupération des patients:', error);
        res.status(500).json({ message: 'Erreur lors de la récupération des patients.' });
    }
});

