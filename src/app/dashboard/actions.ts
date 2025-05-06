"use server"
import { prisma } from "@/lib/prisma";
import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid';

const PAYU_KEY = process.env.PAYU_KEY;  
const PAYU_SALT = process.env.PAYU_SALT_32BIT;

// if (!PAYU_KEY || !PAYU_SALT) {
//     console.log('PAYU_KEY and PAYU_SALT must be set');
//     throw new Error('PAYU_KE and PAYU_SALT must be set');
// }


export interface PlansForFrontend { 
    id: string,
    name: string,
    price: number,
    features: Record<string, boolean>
}

export interface ErrorResponse { 
    success: false,
    error: string,
    errorMessage: string,
    errorCode: string | null,
}

export interface PlansSuccessResponse { 
    success: true,
    plans: PlansForFrontend[],
}

export async function getPlans(): Promise<PlansSuccessResponse | ErrorResponse> {
    try {
        //verify the user first TODO-PENDING-AUTH
        console.log("Fetching all plans...")
        const plans = await prisma.plan.findMany({
            select: { 
                id: true, 
                name: true, 
                price: true, 
                features: true
            }
        });
        return {
            success: true,
            plans: plans.map((plan) => ({
                id: plan.id,
                name: plan.name,
                price: plan.price.toNumber(),
                features: plan.features as Record<string, boolean>,
            })),
        };
    } catch (error) {
        console.log("Error fetching plans: ", error)
        if (error instanceof Error) {
            return {
                success: false,
                error: 'Failed to fetch plans',
                errorMessage: error.message,
                errorCode: 'FAILED_TO_FETCH_PLANS',
            }
        } 
        
        return {
            success: false,
            error: 'Failed to fetch plans',
            errorMessage: 'An unknown error occurred',
            errorCode: 'UNKNOWN_ERROR',
        }
    }

}

export interface InitiatePaymentSuccessResponse { 
    success: true,
    txnId: string,
    amount: number,
    hash: string,
    productInfo: string,
    user: {
        name: string | null,
        email: string | null,
        phone: string,
    }
}


export async function initiatePayment(planName: string): Promise<InitiatePaymentSuccessResponse | ErrorResponse> {
    try {
        //verify the user first TODO-PENDING-AUTH
        const dummyUserId = "1234";

        console.log('Initiating payment for plan: ', planName, 'for user: ', dummyUserId);

        const user = await prisma.user.findUnique({
            where: {
                id: dummyUserId,
            },
            select: {
                id: true, 
                email: true, 
                phone: true,
                name: true
            },
        });
        
        if (!user) {
            console.log("User not found.", user)
            return {
                success: false,
                error: 'User not found',
                errorMessage: 'The user you are trying to pay for does not exist',
                errorCode: 'USER_NOT_FOUND',
            }
        }

        console.log("User found: ", user)
        
        const plan = await prisma.plan.findUnique({
            where: {
                name: planName,
            },
            select: { 
                id: true, 
                price: true, 
            }
        });

        if (!plan) {
            console.log("Plan not found: ", plan)
            return {
                success: false,
                error: 'Plan not found',
                errorMessage: 'The plan you are trying to pay for does not exist',
                errorCode: 'PLAN_NOT_FOUND',
            }
        }

        console.log("Plan found: ", plan)

        //check if active subscription or not
        const activeSubscription = await prisma.subscription.findFirst({
            where: {
                userId: dummyUserId,
                isActive: true
            },
            select: { 
                id: true,
                endDate: true
            }
        });

        if (activeSubscription) {   
            console.log("Active subscription found: ", activeSubscription)
            return {
                success: false,
                error: 'Subscription already exists',
                errorMessage: 'You have a valid subscription.',
                errorCode: 'SUBSCRIPTION_ALREADY_EXISTS',
            }
        }

        console.log("No active subscription found.")

        //Unexpired initiated txn for the same plan exists ? Then reuse that. 
        const currentTime = new Date();
        const previousPayments = await prisma.payment.findMany({ 
            where: { 
                userId: dummyUserId,
                status: "initiated", 
                planId: plan.id,
                expiresAt: { 
                    gt: currentTime,
                }
            },
            select: { 
                txnId: true, 
                hash: true
            }
        })

        //reuse the previous txn id
        let txnId: string;
        let hash: string;
        if (previousPayments.length > 0) {
            console.log("Previous payment found: ", previousPayments[0])
            txnId = previousPayments[0].txnId;
            hash = previousPayments[0].hash;
        } else {
            console.log("No previous payment found. Starting a new payment.")
            //start a new payment 
            txnId = "txn_" + uuidv4();

            //hash for payu 
            const hashString = `${PAYU_KEY}|${txnId}|${plan.price.toNumber()}|ReviseTax ${planName} Plan|${user.name}|${user.email}|||||||||||${PAYU_SALT}`;
            hash = crypto.createHash('sha512').update(hashString).digest('hex');
            console.log("Hash String: ", hashString)
            await prisma.payment.create({ 
                data: { 
                    userId: dummyUserId,
                    planId: plan.id,
                    txnId,
                    status: 'initiated',
                    amount: plan.price.toNumber(),
                    hash,
                    initiatedAt: new Date(),
                    expiresAt: new Date(Date.now() + 1000 * 35 * 60), // 35 minutes
                }
            })
            console.log("New payment created: ", txnId)
        }
        
        return { 
            success: true, 
            txnId, 
            amount: plan.price.toNumber(),
            hash,
            productInfo: "ReviseTax " + planName + " Plan",
            user: {
                name: user.name,
                email: user.email,
                phone: user.phone,
            }                
        }
    } catch (error) {
        console.log("Error initiating payment: ", error)
        if (error instanceof Error) {
            return {
                success: false,
                error: 'Failed to initiate payment',
                errorMessage: error.message,
                errorCode: 'FAILED_TO_INITIATE_PAYMENT',
            }
        }

        return {
            success: false,
            error: 'Failed to initiate payment',
            errorMessage: 'An unknown error occurred',
            errorCode: 'UNKNOWN_ERROR',
        }
    }
}

export interface UserSubscriptionSuccessResponse { 
    success: true,
    subscription: {
        id: string,
        startDate: Date,
        endDate: Date,
        isActive: boolean,
        plan: {
            id: string,
            name: string,
            price: number,
        }
    } | null,
}

export async function getUserSubscription(): Promise<UserSubscriptionSuccessResponse | ErrorResponse> { 
    try { 
        //verify the user first TODO-PENDING-AUTH
        const dummyUserId = "1234";

        console.log("Getting user subscription for user: ", dummyUserId);

        const subscription = await prisma.subscription.findFirst({
            where: {
                userId: dummyUserId,
                isActive: true
            },
            select: {
                id: true,
                startDate: true,
                endDate: true,
                isActive: true,
                Plan: {
                    select: {
                        id: true,
                        name: true,
                        price: true,
                    }
                }
            }
        });

        if (!subscription) {
            console.log("No active subscription found.")
            return {    
                success: true,
                subscription: null,
            }
        }

        console.log("Active subscription found: ", subscription)
        
        return {
            success: true,
            subscription: {
                id: subscription.id,
                startDate: subscription.startDate,
                endDate: subscription.endDate,
                isActive: subscription.isActive,
                plan: {
                    id: subscription.Plan.id,
                    name: subscription.Plan.name,
                    price: subscription.Plan.price.toNumber(),
                }
            }   
        }
    } catch (error) {
        console.log("Error getting user subscription: ", error)
        if (error instanceof Error) {
            return {
                success: false,
                error: 'Failed to get user subscription',
                errorMessage: error.message,
                errorCode: 'FAILED_TO_GET_USER_SUBSCRIPTION',
            }
        }

        return {
            success: false,
            error: 'Failed to get user subscription',
            errorMessage: 'An unknown error occurred',
            errorCode: 'UNKNOWN_ERROR',
        }
    }
}