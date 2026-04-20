import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import type { MealItems } from '@/lib/types';
import { INITIAL_MEAL_ITEMS } from '@/lib/data';

// Everyone shares a single meal-items document so the app works
// anonymously across origins.
const MEAL_ITEMS_COLLECTION = 'meal-data';
const SHARED_DOC_ID = 'shared';

export async function getMealItems(): Promise<MealItems> {
    try {
        const sharedRef = doc(db, MEAL_ITEMS_COLLECTION, SHARED_DOC_ID);
        const sharedSnap = await getDoc(sharedRef);
        if (sharedSnap.exists()) {
            return sharedSnap.data() as MealItems;
        }

        // One-time migration: if shared doc is missing, check whether the
        // currently signed-in anonymous user has legacy per-user data, and
        // promote it to the shared doc so everyone sees the same data.
        const userId = auth.currentUser?.uid;
        if (userId) {
            const legacyRef = doc(db, MEAL_ITEMS_COLLECTION, userId);
            const legacySnap = await getDoc(legacyRef);
            if (legacySnap.exists()) {
                const legacyItems = legacySnap.data() as MealItems;
                await setDoc(sharedRef, legacyItems);
                return legacyItems;
            }
        }

        // No shared doc, no legacy doc: seed with defaults.
        await setDoc(sharedRef, INITIAL_MEAL_ITEMS);
        return INITIAL_MEAL_ITEMS;
    } catch (error) {
        console.error("Error fetching meal items from Firestore, returning initial data.", error);
        return INITIAL_MEAL_ITEMS;
    }
}

export async function saveMealItems(mealItems: MealItems): Promise<void> {
    try {
        const docRef = doc(db, MEAL_ITEMS_COLLECTION, SHARED_DOC_ID);
        await setDoc(docRef, mealItems);
    } catch(error) {
        console.error("Error saving meal items to Firestore.", error);
        throw new Error("Could not save meal items.");
    }
}
