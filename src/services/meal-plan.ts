
'use server';

import { collection, doc, getDocs, limit, orderBy, query, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { DailyPlan, MealPlanData } from '@/lib/types';

// Shared collection — no per-user keying. The app is designed to work
// anonymously, so every visitor reads and writes the same meal plan.
const SHARED_DAILY_MEALS_COLLECTION = 'shared-daily-meals';

export async function getLatestMealPlan(): Promise<MealPlanData | null> {
    try {
        const plansCollection = collection(db, SHARED_DAILY_MEALS_COLLECTION);

        const q = query(plansCollection, orderBy("date", "asc"), limit(14));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            return null;
        }

        const dailyPlans: DailyPlan[] = querySnapshot.docs.map(doc => doc.data() as DailyPlan);

        if (dailyPlans.length === 0) {
            return null;
        }

        return {
            plan: dailyPlans,
            startDate: dailyPlans[0].date,
        };
    } catch (error) {
        console.error("Error fetching latest meal plan from Firestore.", error);
        return null;
    }
}

export async function saveMealPlan(mealPlanData: MealPlanData): Promise<void> {
    try {
        const batch = writeBatch(db);

        mealPlanData.plan.forEach((dailyPlan) => {
            const planId = dailyPlan.date;
            const docRef = doc(db, SHARED_DAILY_MEALS_COLLECTION, planId);

            const dataToSave: DailyPlan = {
                ...dailyPlan,
                date: planId,
            };
            batch.set(docRef, dataToSave, { merge: true });
        });

        await batch.commit();
    } catch(error) {
        console.error("Error saving meal plan to Firestore.", error);
        throw new Error("Could not save meal plan.");
    }
}
