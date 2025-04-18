/**
 * Matching Service for Lost and Found Items
 * 
 * This service provides functionality to match lost items with found items and vice versa
 * using various criteria including category, color, description, brand, and time proximity.
 */

import { collection, getDocs, query, where, addDoc, doc, getDoc, updateDoc } from 'firebase/firestore';
import { app } from '../firebase.js';
import { getFirestore } from 'firebase/firestore';
import 'primeicons/primeicons.css';
import { useUserStore } from '@/stores/user-store';

// Initialize Firestore database instance
const db = getFirestore(app);

/**
 * Finds matching found items for a reported lost item
 * 
 * @param {Object} formData - Lost item form data containing category, color, brand, datetime, etc.
 * @returns {Array} Array of matching found items
 * @throws {Error} If unable to retrieve matching items
 */
export async function findMatchingItems(formData) {
    try {
        // Validate datetime input
        const dateTimeLostString = formData.datetime;
        if (!dateTimeLostString || typeof dateTimeLostString !== 'string') {
            throw new Error("'datetime' is missing or not a valid string.");
        }

        const dateTimeLost = new Date(dateTimeLostString);
        if (isNaN(dateTimeLost.getTime())) {
            throw new Error("'datetime' is not a valid date string.");
        }

        // Calculate date range for matching (7 days after lost date)
        const sevenDaysAfterLost = new Date(dateTimeLost);
        sevenDaysAfterLost.setDate(dateTimeLost.getDate() + 7);

        const foundItemRef = collection(db, 'Found Item');
        let results = [];

        // STRATEGY 1: Try to match by both category and color
        const categoryColorQuery = query(
            foundItemRef,
            where('category', '==', formData.category),
            where('colour', '==', formData.color)
        );

        const querySnapshot = await getDocs(categoryColorQuery);

        // STRATEGY 2: If no matches with category AND color, try with category only
        if (querySnapshot.empty) {
            const categoryQuery = query(foundItemRef, where('category', '==', formData.category));
            const categorySnapshot = await getDocs(categoryQuery);

            if (categorySnapshot.empty) {
                return []; // No matches found at all
            }

            // Process category-only matches with additional filtering
            categorySnapshot.forEach((doc) => {
                const docData = doc.data();

                // Check for description or brand matches
                const lostDescriptionWords = formData.description?.toLowerCase().match(/\b\w+\b/g) || [];
                const lostSet = new Set(lostDescriptionWords);

                const lostBrandWords = formData.brand?.toLowerCase().match(/\b\w+\b/g) || [];
                const lostBrandSet = new Set(lostBrandWords);

                let descMatched = false;
                let brandMatched = false;

                // Check description match
                if (docData.description) {
                    const foundDescriptionWords = docData.description.toLowerCase().match(/\b\w+\b/g) || [];
                    const foundDescSet = new Set(foundDescriptionWords);
                    descMatched = [...lostSet].some((word) => foundDescSet.has(word));
                }

                // Check brand match
                if (docData.brand) {
                    const foundBrandWords = docData.brand.toLowerCase().match(/\b\w+\b/g) || [];
                    const foundBrandSet = new Set(foundBrandWords);
                    brandMatched = [...lostBrandSet].some((word) => foundBrandSet.has(word));
                }

                const descriptionMatch = descMatched || brandMatched;

                // Convert and normalize date format
                let dateTimeFound = docData.date_time_found;
                if (dateTimeFound && dateTimeFound.toDate) {
                    dateTimeFound = dateTimeFound.toDate();
                } else {
                    dateTimeFound = new Date(dateTimeFound);
                }

                // Check if dates are within 7-day window
                const timeDiff = Math.abs(dateTimeFound - dateTimeLost);
                const diffInDays = timeDiff / (1000 * 60 * 60 * 24);

                // Add to results if within date range and description matches
                if (diffInDays <= 7 && descriptionMatch) {
                    results.push({ id: doc.id, ...docData });
                }
            });
        } else {
            // Process category and color matches
            querySnapshot.forEach((doc) => {
                const docData = doc.data();

                // Convert and normalize date format
                let dateTimeFound = docData.date_time_found;
                if (dateTimeFound && dateTimeFound.toDate) {
                    dateTimeFound = dateTimeFound.toDate();
                } else {
                    dateTimeFound = new Date(dateTimeFound);
                }

                // Special handling for "others" category and student cards
                let descriptionMatch = true; // Default to true
                if ((formData.category === 'others' || formData.category === 'Student Card') && docData.description) {
                    const lostDescriptionWords = formData.description?.toLowerCase().match(/\b\w+\b/g) || [];
                    const foundDescriptionWords = docData.description?.toLowerCase().match(/\b\w+\b/g) || [];

                    const lostSet = new Set(lostDescriptionWords);
                    const foundSet = new Set(foundDescriptionWords);

                    // Check if any word in lost description is in found description
                    descriptionMatch = [...lostSet].some((word) => foundSet.has(word));
                }

                // Check if dates are within 7-day window
                const timeDiff = Math.abs(dateTimeFound - dateTimeLost);
                const diffInDays = timeDiff / (1000 * 60 * 60 * 24);

                // Add to results if color matches, item is unclaimed, within date range, and description matches
                if (docData.colour === formData.color && 
                    docData.claimed_status === 'Not Found Yet' && 
                    diffInDays <= 7 && 
                    descriptionMatch) {
                    results.push({ id: doc.id, ...docData });
                }
            });
        }

        // Filter out items reported by the current user
        const userStore = useUserStore();
        const userId = userStore.userId;
        const filteredResults = results.filter(item => item.reporter_id !== userId);
        
        return filteredResults;
    } catch (error) {
        console.error('Error finding matching items:', error);
        throw new Error('Unable to retrieve matching items. Please try again later.');
    }
}

/**
 * Finds matching lost items for a reported found item and sends notifications
 * 
 * @param {Object} formData - Found item form data containing category, color, brand, datetime, etc.
 * @returns {Array} Array of matching lost item IDs
 * @throws {Error} If unable to retrieve matching items
 */
export async function findMatchingLostItems(formData) {
    try {
        // Validate datetime input
        const dateTimeLostString = formData.datetime;
        if (!dateTimeLostString || typeof dateTimeLostString !== 'string') {
            throw new Error("'datetime' is missing or not a valid string.");
        }

        const dateTimeLost = new Date(dateTimeLostString);
        if (isNaN(dateTimeLost.getTime())) {
            throw new Error("'datetime' is not a valid date string.");
        }

        // Calculate date range for matching (7 days before found date)
        const sevenDaysBeforeLost = new Date(dateTimeLost);
        sevenDaysBeforeLost.setDate(dateTimeLost.getDate() - 7);

        const lostItemRef = collection(db, 'Lost Item');
        let results = [];

        // STRATEGY 1: Try to match by both category and color
        const categoryColorQuery = query(
            lostItemRef,
            where('category', '==', formData.category),
            where('colour', '==', formData.color)
        );

        const querySnapshot = await getDocs(categoryColorQuery);

        // STRATEGY 2: If no matches with category AND color, try with category only
        if (querySnapshot.empty) {
            const categoryQuery = query(lostItemRef, where('category', '==', formData.category));
            const categorySnapshot = await getDocs(categoryQuery);

            if (categorySnapshot.empty) {
                return []; // No matches found at all
            }

            // Process category-only matches with additional filtering
            categorySnapshot.forEach((doc) => {
                const docData = doc.data();

                // Check for description or brand matches
                const lostDescriptionWords = formData.description?.toLowerCase().match(/\b\w+\b/g) || [];
                const lostSet = new Set(lostDescriptionWords);

                const lostBrandWords = formData.brand?.toLowerCase().match(/\b\w+\b/g) || [];
                const lostBrandSet = new Set(lostBrandWords);

                let descMatched = false;
                let brandMatched = false;

                // Check description match
                if (docData.description) {
                    const foundDescriptionWords = docData.description.toLowerCase().match(/\b\w+\b/g) || [];
                    const foundDescSet = new Set(foundDescriptionWords);
                    descMatched = [...lostSet].some((word) => foundDescSet.has(word));
                }

                // Check brand match
                if (docData.brand) {
                    const foundBrandWords = docData.brand.toLowerCase().match(/\b\w+\b/g) || [];
                    const foundBrandSet = new Set(foundBrandWords);
                    brandMatched = [...lostBrandSet].some((word) => foundBrandSet.has(word));
                }

                const descriptionMatch = descMatched || brandMatched;

                // Convert and normalize date format
                let dateTimeLostInDB = docData.date_time_lost;
                if (dateTimeLostInDB && dateTimeLostInDB.toDate) {
                    dateTimeLostInDB = dateTimeLostInDB.toDate();
                } else {
                    dateTimeLostInDB = new Date(dateTimeLostInDB);
                }

                // Check if dates are within 7-day window
                const timeDiff = Math.abs(dateTimeLostInDB - dateTimeLost);
                const diffInDays = timeDiff / (1000 * 60 * 60 * 24);

                // Add to results if within date range and description matches
                if (diffInDays <= 7 && descriptionMatch) {
                    results.push({ id: doc.id, ...docData });
                }
            });
        } else {
            // Process category and color matches
            querySnapshot.forEach((doc) => {
                const docData = doc.data();

                // Convert and normalize date format
                let dateTimeLostInDB = docData.date_time_lost;
                if (dateTimeLostInDB && dateTimeLostInDB.toDate) {
                    dateTimeLostInDB = dateTimeLostInDB.toDate();
                } else {
                    dateTimeLostInDB = new Date(dateTimeLostInDB);
                }

                // Special handling for "others" category and student cards
                let descriptionMatch = true; // Default to true
                if ((formData.category === 'others' || formData.category === 'Student Card') && docData.description) {
                    const lostDescriptionWords = formData.description?.toLowerCase().match(/\b\w+\b/g) || [];
                    const foundDescriptionWords = docData.description?.toLowerCase().match(/\b\w+\b/g) || [];

                    const lostSet = new Set(lostDescriptionWords);
                    const foundSet = new Set(foundDescriptionWords);

                    // Check if any word in found description is in lost description
                    descriptionMatch = [...lostSet].some((word) => foundSet.has(word));
                }

                // Check if dates are within 7-day window
                const timeDiff = Math.abs(dateTimeLostInDB - dateTimeLost);
                const diffInDays = timeDiff / (1000 * 60 * 60 * 24);

                // Add to results if color matches, item is unclaimed, within date range, and description matches
                if (docData.colour === formData.color && 
                    docData.claimed_status === 'Not Found Yet' && 
                    diffInDays <= 7 && 
                    descriptionMatch) {
                    results.push({ id: doc.id, ...docData });
                }
            });
        }

        // Filter out items reported by the current user
        const userStore = useUserStore();
        const userId = userStore.userId;
        const filteredResults = results.filter(item => item.reporter_id !== userId);
        
        // Extract just the lost item IDs for processing
        const matchingIds = filteredResults.map(item => item.lost_item_id);

        // Process each matching item
        for (const itemId of matchingIds) {
            // Skip placeholder items
            if (itemId === 'empty for now') {
                continue;
            }
            
            // Get the lost item document
            const lostItemRef = doc(db, 'Lost Item', itemId);
            const lostItemSnap = await getDoc(lostItemRef);
            
            if (lostItemSnap.exists()) {
                const lostItemData = lostItemSnap.data();
                // Send notification email to the item owner
                await sendEmail(lostItemData.email, lostItemData);
            }
            
            // Mark the lost item as having a potential match
            await updateDoc(lostItemRef, {
                found_afterwards: true,
            });
        }

        return matchingIds;
    } catch (error) {
        console.error('Error finding matching lost items:', error);
        throw new Error('Unable to retrieve matching items. Please try again later.');
    }
}

/**
 * Sends a notification email to a user when a potential match is found
 * 
 * @param {string} userEmail - Email address of the recipient
 * @param {Object} data - Data about the lost item for email content
 */
async function sendEmail(userEmail, data) {
    try {
        // Format the date for email display
        const emailDate = data.date_time_lost.replace('T', ' ');
        
        // Create an email document in the 'mail' collection for the email service to process
        await addDoc(collection(db, 'mail'), {
            to: userEmail,
            message: {
                subject: 'Your lost item has found a potential match!',
                html: `Congratulations, we have found you a potential match for your lost ${data.name} that was lost in ${data.location} on ${emailDate}!`,
            },
        });
    } catch (error) {
        console.error('Error queuing email:', error);
        // Email failure shouldn't break the entire flow, so we just log the error
    }
}