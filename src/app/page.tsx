
'use client';

import * as React from 'react';
import { suggestNewMealPlan } from '@/ai/flows/suggest-new-meal-plan';
import { updateSingleMeal } from '@/ai/flows/update-single-meal';
import type { DailyPlan, Meal, MealItems, MealPlan, MealType } from '@/lib/types';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { Header } from '@/components/Header';
import { MealPlanDisplay } from '@/components/MealPlanDisplay';
import { MealManager } from '@/components/MealManager';
import { useToast } from '@/hooks/use-toast';
import Loading from './loading';
import { getMealItems, saveMealItems } from '@/services/meal-items';
import { getLatestMealPlan, saveMealPlan } from '@/services/meal-plan';
import { differenceInDays, startOfToday } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';

function MealWhizContent() {
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();

  const [mealItems, setMealItems] = React.useState<MealItems | null>(null);
  const [mealPlan, setMealPlan] = React.useState<MealPlan | null>(null);
  const [planStartDate, setPlanStartDate] = React.useState<string | null>(null);
  
  const [isLoading, setIsLoading] = React.useState(true);
  const [isGeneratingPlan, setIsGeneratingPlan] = React.useState(false);
  const [isUpdatingMeal, setIsUpdatingMeal] = React.useState<string | null>(null);
  
  const handleSavePlan = React.useCallback(async (plan: MealPlan, startDate: Date) => {
    if (!user) {
        console.warn("Save requested, but user is not authenticated.");
        return;
    }
    try {
      await saveMealPlan({ plan, startDate: startDate.toISOString() });
    } catch (error) {
      console.error('Failed to save meal plan:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Could not save your meal plan. Your changes might not be persisted.',
      });
    }
  }, [toast, user]);

  const handleGenerateNewPlan = React.useCallback(async (currentMealItems: MealItems) => {
    if (!user || !currentMealItems) {
      toast({ variant: 'destructive', title: 'Error', description: 'Cannot generate a plan. Please wait a moment and try again.' });
      return;
    }
    setIsGeneratingPlan(true);
    try {
      const newStartDate = startOfToday();
      const newPlan = await suggestNewMealPlan({
        breakfastItems: currentMealItems.Breakfast,
        lunchItems: currentMealItems.Lunch,
        dinnerItems: currentMealItems.Dinner,
        snackItems: currentMealItems.Snack,
        numberOfDays: 14,
        startDate: newStartDate.toISOString(),
      });
      
      setMealPlan(newPlan);
      setPlanStartDate(newStartDate.toISOString());
      await handleSavePlan(newPlan, newStartDate);

      toast({
        title: 'New Meal Plan Generated!',
        description: 'Your two-week meal plan has been refreshed and saved.',
      });

    } catch (error) {
      console.error('Failed to generate new meal plan:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Could not generate a new meal plan. Please try again.',
      });
    } finally {
      setIsGeneratingPlan(false);
    }
  }, [handleSavePlan, toast, user]);

  React.useEffect(() => {
    async function loadData() {
        if (!user) return; 

        setIsLoading(true);
        try {
            const items = await getMealItems();
            setMealItems(items);
            
            const storedPlanData = await getLatestMealPlan();
            if (storedPlanData && storedPlanData.plan.length > 0) {
                setMealPlan(storedPlanData.plan);
                setPlanStartDate(storedPlanData.startDate);
            }
            // If no plan exists, leave it empty — the user can click
            // "Generate New Plan" in the header to create one on demand.
            // We intentionally do NOT auto-invoke the AI here to avoid
            // burning API quota on every first page load.
        } catch (error) {
            console.error("Error during initial data load:", error);
            toast({
                variant: 'destructive',
                title: 'Loading Error',
                description: 'Could not load your data. Please refresh the page.',
            });
            setMealPlan(null);
        } finally {
            setIsLoading(false);
        }
    }
    if (!authLoading && user) {
      loadData();
    }
  }, [user, authLoading, toast, handleGenerateNewPlan]);

  const handleUpdateMeal = React.useCallback(
    async (dayIndex: number, mealType: MealType, newMeal: Meal) => {
      if (!mealPlan || !planStartDate || !user) return;

      const updatedPlan = JSON.parse(JSON.stringify(mealPlan));
      updatedPlan[dayIndex][mealType] = newMeal;
      
      setMealPlan(updatedPlan);
      await handleSavePlan(updatedPlan, new Date(planStartDate));
     
      toast({
        title: `${mealType} Updated!`,
        description: `'${newMeal}' has been set for ${mealType.toLowerCase()}.`,
      });
    },
    [mealPlan, planStartDate, handleSavePlan, user, toast]
  );
  
  const handleRefreshSingleMeal = React.useCallback(
    async (dayIndex: number, mealType: MealType) => {
      if (!mealPlan || !planStartDate || !user || !mealItems) return;

      const updateKey = `${dayIndex}-${mealType}`;
      setIsUpdatingMeal(updateKey);
      try {
        const currentMeal = mealPlan[dayIndex][mealType];
        const availableMealsForType = mealItems[mealType];
        
        const { meal: newMeal } = await updateSingleMeal({
          availableMeals: availableMealsForType,
          currentMeal: currentMeal,
        });

        if (newMeal && newMeal !== currentMeal) {
          await handleUpdateMeal(dayIndex, mealType, newMeal);
        } else {
           toast({
            variant: 'destructive',
            title: 'No alternative found',
            description: `Could not find a different meal for ${mealType}.`,
          });
        }
      } catch (error) {
        console.error('Failed to refresh meal:', error);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: `Could not refresh the ${mealType.toLowerCase()}. Please try again.`,
        });
      } finally {
        setIsUpdatingMeal(null);
      }
    },
    [mealPlan, planStartDate, user, mealItems, handleUpdateMeal, toast]
  );

  const handleMealItemsChange = async (newItems: MealItems) => {
    setMealItems(newItems);
     if (!user) {
        console.warn("User not authenticated. Cannot save meal items yet.");
        return;
    }
    try {
      await saveMealItems(newItems);
      toast({
        title: 'Meal List Updated',
        description: 'Your changes have been saved.',
      });
    } catch (error) {
       toast({
        variant: 'destructive',
        title: 'Save Error',
        description: 'Could not save your meal list. Please try again.',
      });
      console.error("Error saving meal items:", error);
    }
  };
  
  if (authLoading || isLoading || !mealItems) {
    return <Loading />;
  }

  const todayIndex = planStartDate
    ? differenceInDays(startOfToday(), new Date(planStartDate))
    : -1;

  const isDataReady = !authLoading && mealItems && mealPlan;

  return (
    <SidebarProvider>
      <MealManager items={mealItems} onChange={handleMealItemsChange} />
      <SidebarInset>
        <div className="flex flex-col min-h-screen">
          <Header
            onNewPlanClick={() => mealItems && handleGenerateNewPlan(mealItems)}
            loading={isGeneratingPlan || !isDataReady}
          />
          <main className="flex-1 p-4 md:p-6">
              {mealPlan ? (
                <MealPlanDisplay
                  plan={mealPlan}
                  startDate={planStartDate ? new Date(planStartDate) : new Date()}
                  todayIndex={todayIndex}
                  availableMeals={mealItems}
                  onUpdateMeal={handleUpdateMeal}
                  onRefreshMeal={handleRefreshSingleMeal}
                  isUpdatingMeal={isUpdatingMeal}
                  loading={isGeneratingPlan || authLoading}
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-center py-24 gap-4">
                  <h2 className="text-2xl font-semibold">No meal plan yet</h2>
                  <p className="text-muted-foreground max-w-md">
                    Click “Generate New Plan” in the header to create your first
                    two-week meal plan.
                  </p>
                </div>
              )}
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

// The main page component that handles the auth state
export default function MealWhizPage() {
    return <MealWhizContent />;
}
