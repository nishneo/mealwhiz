
'use server';

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { MealItems } from '@/lib/types';
import { INITIAL_MEAL_ITEMS } from '@/lib/data';

// Everyone shares a single meal-items document. The app is designed to be
// usable without login, so we intentionally do not key by user.
const MEAL_ITEMS_COLLECTION = 'meal-data';
const SHARED_DOC_ID = 'shared';

export async function getMealItems(): Promise<MealItems> {
    try {
        const docRef = doc(db, MEAL_ITEMS_COLLECTION, SHARED_DOC_ID);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            return docSnap.data() as MealItems;
        }
        // Pre-warm the shared document on first run.
        await setDoc(docRef, INITIAL_MEAL_ITEMS);
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

    