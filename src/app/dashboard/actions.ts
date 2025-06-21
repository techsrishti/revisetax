"use server"
import { prisma } from "@/lib/prisma";
import { ChatTypes } from "@prisma/client";
import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid';
import { createClient } from '@/utils/supabase/server';
import Redis from 'ioredis';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

const PAYU_KEY = process.env.PAYU_KEY;  
const PAYU_SALT = process.env.PAYU_SALT_32BIT;

// if (!PAYU_KEY || !PAYU_SALT) {
//     console.log('PAYU_KEY and PAYU_SALT must be set');
//     throw new Error('PAYU_KE and PAYU_SALT must be set');
// }

const redis = new Redis();


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
        const startTime = Date.now();
        const cached = await redis.get('plans:all');
        const cachedPlans = cached ? JSON.parse(cached) : null;

        if (cachedPlans) {
            console.log("Plans found in cache.")
            const endTime = Date.now();
            console.log("endTime: ", endTime)
            console.log("startTime: ", startTime)
            console.log("Time taken to fetch plans from cache: ", endTime - startTime, "ms")
            return {
                success: true,
                plans: cachedPlans,
            };
        }

        console.log("Fetching all plans...")
        const plans = await prisma.plan.findMany({
            select: { 
                id: true, 
                name: true, 
                price: true, 
                features: true
            }
        });

        await redis.set('plans:all', JSON.stringify(plans));
        const endTime = Date.now();
        console.log("Time taken to fetch plans from database: ", endTime - startTime, "ms")
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
        phoneNumber: string,
    }
}


export async function initiatePayment(planName: string): Promise<InitiatePaymentSuccessResponse | ErrorResponse> {
    try {
        //verify the user first TODO-PENDING-AUTH
        const dummyUserId = "1234";
        const supabase = await createClient()
        const { data: { user: supabaseUser } } = await supabase.auth.getUser()

        if (!supabaseUser) {
            console.log("User not found.")
            return {
                success: false,
                error: 'User not found',
                errorMessage: 'The user you are trying to pay for does not exist',
                errorCode: 'USER_NOT_FOUND',
            }
        }

        console.log("User found: ", supabaseUser)
        

        console.log('Initiating payment for plan: ', planName, 'for user: ', dummyUserId);

        const user = await prisma.user.findUnique({
            where: {
                supabaseUserId: supabaseUser.id,
            },
            select: {
                id: true, 
                email: true, 
                phoneNumber: true,
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
                userId: user.id,
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
                userId: user.id,
                status: "initiated", 
                planId: plan.id,
                // expiresAt: { 
                //     gt: currentTime,
                // }
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
            //start a new payment /
            //TODO UUIDv4
            txnId = "txn_" + uuidv4();

            //hash for payu 
            const hashString = `${PAYU_KEY}|${txnId}|${plan.price.toNumber()}|ReviseTax ${planName} Plan|${user.name}|${user.email}|||||||||||${PAYU_SALT}`;
            hash = crypto.createHash('sha512').update(hashString).digest('hex');
            console.log("Hash String: ", hashString)
            await prisma.payment.create({ 
                data: { 
                    userId: user.id,
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
                phoneNumber: user.phoneNumber,
            }                
        }
    } catch (error) {
        console.log("Error initiating payment: ", error)
        if (error instanceof Error) {
            return {
                success: false,
                error: 'Failed to initiate payment',
                errorMessage: "An unknown error occurred. Please try again later or contact support at https://support.revisetax.com",
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
        const startTime = Date.now();
        const supabase = await createClient()
        const { data: { user: supabaseUser } } = await supabase.auth.getUser()

        if (!supabaseUser) {
            console.log("getUserSubscription: User not found.")
            return {
                success: false,
                error: 'User not found',
                errorMessage: 'The user you are trying to pay for does not exist',
                errorCode: 'USER_NOT_FOUND',
            }
        }

        const user = await prisma.user.findUnique({

            where: {
                supabaseUserId: supabaseUser.id,
            },
        });

        if (!user) {
            console.log("getUserSubscription: User not found in the db")
            return {
                success: false,
                error: 'User not found',
                errorMessage: 'The user you are trying to pay for does not exist',
                errorCode: 'USER_NOT_FOUND',
            }
        }

        const subscription = await prisma.subscription.findFirst({
            where: {
                userId: user.id,
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
            console.log("getUserSubscription: No active subscription found.")
            return {    
                success: true,
                subscription: null,
            }
        }

        console.log("getUserSubscription: Active subscription found: ", subscription)
        const endTime = Date.now();
        console.log("Time taken to get user subscription: ", endTime - startTime, "ms")
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
        console.log("getUserSubscription: Error getting user subscription: ", error)
        if (error instanceof Error) {
            return {
                success: false,
                error: 'Failed to get user subscription',
                errorMessage: "An unknown error occurred. Please try again later or contact support at https://support.revisetax.com",
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

export interface GetPaymentsSuccessResponse { 
    success: true,
    payments: {
        txnId: string,
        status: string,
        failedReason: string | null,
        amount: number,
        initiatedAt: Date,
        settledAt: Date | null,
        invoiceUrl: string | null,
        invoiceId: string | null,
        planName: string,
    }[]
}

export async function getPayments(): Promise<GetPaymentsSuccessResponse | ErrorResponse> { 

    try { 
        const supabase = await createClient()
        const { data: { user: supabaseUser } } = await supabase.auth.getUser()

        if (!supabaseUser) { 
            console.log("getPayments: User not found.")
            return { 
                success: false,
                error: 'User not found',
                errorMessage: 'The user you are trying to pay for does not exist',
                errorCode: 'USER_NOT_FOUND',
            }
        }

        const user = await prisma.user.findUnique({
            where: { 
                supabaseUserId: supabaseUser.id,
            },
            select: { 
                id: true,
            }   
        })

        if (!user) { 
            console.log("getPayments: User not found in the db")
            return { 
                success: false,
                error: 'User not found',
                errorMessage: 'The user you are trying to pay for does not exist',
                errorCode: 'USER_NOT_FOUND',
            }
        }

        const payments = await prisma.payment.findMany({
            where: { 
                userId: user.id,
            },
            select: { 
                txnId: true,
                status: true, 
                failedReason: true,
                amount: true, 
                initiatedAt: true, 
                settledAt: true, 
                invoiceUrl: true,
                invoiceId: true,
                Plan: {
                    select: { 
                        name: true,
                    }
                }
            }
        })

        return { 
            success: true,
            payments: payments.map((payment) => ({
                txnId: payment.txnId,
                status: payment.status,
                failedReason: payment.failedReason,
                amount: payment.amount.toNumber(),
                initiatedAt: payment.initiatedAt,
                settledAt: payment.settledAt,
                invoiceUrl: payment.invoiceUrl,
                invoiceId: payment.invoiceId,
                planName: payment.Plan.name,
            }))
        }
    } catch (error) { 
        console.log("getPayments: Error getting payments: ", error)
        return { 
            success: false,
            error: 'Failed to get payments',
            errorMessage: 'An unknown error occurred',
            errorCode: 'UNKNOWN_ERROR',
        }
    }

}

export interface GetInvoiceSuccessResponse { 
    success: boolean,
    invoiceUrl?: string,
    error?: string,
    errorMessage?: string,
    errorCode?: string,
}


export async function getInvoice(invoiceId: string): Promise<GetInvoiceSuccessResponse > { 
    try { 
        const supabase = await createClient()
        const { data: { user: supabaseUser } } = await supabase.auth.getUser()

        if (!supabaseUser) { 
            console.log("getInvoice: User not found.")
            return { 
                success: false,
                error: 'User not found',
                errorMessage: 'The user you are trying to pay for does not exist',
                errorCode: 'USER_NOT_FOUND',
            }
        }

        const user = await prisma.user.findUnique({
            where: { 
                supabaseUserId: supabaseUser.id,
            },
            select: { 
                id: true,
                Payment: {
                    where: { 
                        invoiceId: invoiceId,
                    }
                }
            }
        })

        if (!user) { 
            console.log("getInvoice: User not found in the db")
            return { 
                success: false,
                error: 'User not found',
                errorMessage: 'The user you are trying to pay for does not exist',
                errorCode: 'USER_NOT_FOUND',
            }
        }

        if (user.Payment.length === 0) { 
            console.log("getInvoice: No payment found for the user with invoiceId: ", invoiceId)
            return { 
                success: false,
                error: 'No payment found',
                errorMessage: 'No payment found for the user for this invoice',
                errorCode: 'NO_PAYMENT_FOUND',
            }
        }

        const s3 = new S3Client({region: "ap-south-2"})

        const command = new GetObjectCommand({
            Bucket: "revisetax-alpha-dev",
            Key: `invoices/${invoiceId}.pdf`,
            ResponseContentDisposition: `attachment; filename="revisetax-invoice-${invoiceId}.pdf"`
        });

        const signedUrl = await getSignedUrl(s3, command, { expiresIn: 60 * 60  });

        return { 
            success: true,
            invoiceUrl: signedUrl,
        }
    } catch (error) { 
        console.log("getInvoice: Error getting invoice: ", error)
        return { 
            success: false,
            error: 'Failed to get invoice',
            errorMessage: 'An unknown error occurred',
            errorCode: 'UNKNOWN_ERROR',
        }
    }
}


export interface GetChatsSuccessResponse { 
    success: true, 
    chats: { 
        id: string, 
        chatName: string, 
        socketIORoomId: string, 
        adminId: string, 
        updatedAt: Date, 
        chatType: string,
    }[]
}

// export async function getChats(): Promise<GetChatsSuccessResponse|ErrorResponse> { 
//     try { 

//         const supabase = await createClient()
//         const { data: { user: supabaseUser } } = await supabase.auth.getUser()

//         if (!supabaseUser) { 
//             console.log("getChats: User not found.")
//             return { 
//                 success: false,
//                 error: 'User not found',
//                 errorMessage: 'The user you are trying to pay for does not exist',
//                 errorCode: 'USER_NOT_FOUND',
//             }
//         }

//         const user = await prisma.user.findUnique({
//             where: { 
//                 supabaseUserId: supabaseUser.id,
//             },
//             select: { 
//                 id: true,
//                 Chat: { 
//                     select: { 
//                         id: true, 
//                         chatName: true, 
//                         socketIORoomId: true, 
//                         adminId: true, 
//                         updatedAt: true, 
//                         chatType: true,
//                     }
//                 }
//             }
//         })

//         if (!user) { 
//             console.log("getChats: User not found in the db")
//             return { 
//                 success: false,
//                 error: 'User not found',
//                 errorMessage: 'The user you are trying to pay for does not exist',
//                 errorCode: 'USER_NOT_FOUND',
//             }
//         }

//         return { 
//             success: true,
//             chats: user.Chat.map((chat) => ({
//                 id: chat.id,
//                 chatName: chat.chatName,
//                 socketIORoomId: chat.socketIORoomId,
//                 adminId: chat.adminId,
//                 updatedAt: chat.updatedAt,
//                 chatType: chat.chatType,
//             }))
//         }

//     } catch (error) { 
//         console.log("getChats: Error getting chats: ", error)
//         return { 
//             success: false,
//             error: 'Failed to get chats',
//             errorMessage: 'An unknown error occurred',
//             errorCode: 'UNKNOWN_ERROR',
//         }
//     }
// }

export interface CreateChatSuccessResponse { 
    success: true,
    chat: { 
        id: string,
        socketIORoomId: string,
        chatName: string,
        chatType: ChatTypes,
        senderId: string,
        updatedAt: Date,
    }
}

// export async function createChat(chatType: ChatTypes, chatName: string): Promise<CreateChatSuccessResponse|ErrorResponse> { 
//     try { 
//         const supabase = await createClient()
//         const { data: { user: supabaseUser } } = await supabase.auth.getUser()

//         if (!supabaseUser) { 
//             console.log("createChat: User not found.")
//             return { 
//                 success: false,
//                 error: 'User not found',
//                 errorMessage: 'The user you are trying to pay for does not exist',
//                 errorCode: 'USER_NOT_FOUND',
//             }
//         }

//         const user = await prisma.user.findUnique({ 
//             where: { 
//                 supabaseUserId: supabaseUser.id,
//             },
//             select: { 
//                 id: true,
//                 Chat: { 
//                     select: { 
//                         chatType: true,
//                     }
//                 }
//             }
//         })

//         if (!user) { 
//             console.log("createChat: User not found in the db")
//             return { 
//                 success: false,
//                 error: 'User not found',
//                 errorMessage: 'The user you are trying to pay for does not exist',
//                 errorCode: 'USER_NOT_FOUND',
//             }
//         }

//         for (const chat of user.Chat) { 
//             if (chat.chatType.toString() === chatType) { 
//                 console.log("createChat: Similar chat type already exists")
//                 return { 
//                     success: false,
//                     error: 'Chat type already exists',
//                     errorMessage: 'A chat with this type already exists',
//                     errorCode: 'CHAT_TYPE_ALREADY_EXISTS',
//                 }
//             }
//         }
        
//         const socketIORoomId = chatType.toString() + "-" + user.id;
//         const chat = await prisma.chat.create({ 
//             data: { 
//                 userId: user.id,
//                 chatType: chatType,
//                 chatName: chatName,
//                 socketIORoomId: socketIORoomId,
//             }
//         })

//         return { 
//             success: true,
//             chat: { 
//                 id: chat.id,
//                 socketIORoomId: socketIORoomId,
//                 chatName: chatName,
//                 chatType: chatType,
//                 senderId: user.id,
//                 updatedAt: new Date(),
//             }
//         }

//     } catch (error) { 
//         console.log("createChat: Error creating chat: ", error)
//         return { 
//             success: false,
//             error: 'Failed to create chat',
//             errorMessage: 'An unknown error occurred',
//             errorCode: 'UNKNOWN_ERROR',
//         }
//     }
// }