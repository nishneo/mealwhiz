import {
    collection,
    doc,
    getDocs,
    limit,
    orderBy,
    query,
    writeBatch,
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import type { DailyPlan, MealPlanData } from '@/lib/types';

// Shared collection for meal plans — every visitor reads/writes the same
// data so the app works anonymously across origins.
const SHARED_DAILY_MEALS_COLLECTION = 'shared-daily-meals';
// Legacy per-user collection — kept only for one-time migration.
const LEGACY_DAILY_MEALS_SUBCOLLECTION = 'daily-meals';

async function fetchDailyPlans(collectionPath: string[]): Promise<DailyPlan[]> {
    const col = collection(db, collectionPath[0], ...collectionPath.slice(1));
    const q = query(col, orderBy('date', 'asc'), limit(14));
    const snap = await getDocs(q);
    return snap.empty ? [] : snap.docs.map(d => d.data() as DailyPlan);
}

export async function getLatestMealPlan(): Promise<MealPlanData | null> {
    try {
        // Primary read: shared collection.
        let dailyPlans = await fetchDailyPlans([SHARED_DAILY_MEALS_COLLECTION]);

        // Fallback: if the shared collection is empty, try to migrate the
        // signed-in user's legacy per-user plan into the shared collection.
        if (dailyPlans.length === 0) {
            const userId = auth.currentUser?.uid;
            if (userId) {
                const legacy = await fetchDailyPlans([
                    'users',
                    userId,
                    LEGACY_DAILY_MEALS_SUBCOLLECTION,
                ]);
                if (legacy.length > 0) {
                    await saveMealPlan({
                        plan: legacy,
                        startDate: legacy[0].date,
                    });
                    dailyPlans = legacy;
                }
            }
        }

        if (dailyPlans.length === 0) {
            return null;
        }

        return {
            plan: dailyPlans,
            startDate: dailyPlans[0].date,
        };
    } catch (error) {
        console.error('Error fetching latest meal plan from Firestore.', error);
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
    } catch (error) {
        console.error('Error saving meal plan to Firestore.', error);
        throw new Error('Could not save meal plan.');
    }
}
