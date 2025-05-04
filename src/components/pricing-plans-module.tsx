import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export default function PricingPlansModule() {
  const plans = [
    {
      name: "Basic",
      price: "₹1,499",
      originalPrice: "₹1,999",
      color: "#00A3B5",
      features: [
        "ITR-1",
        "Form 16",
        "Other Income",
        "Tax Deductions",
        "Basic Form 16",
        "Standard Deductions",
        "Previous Year Returns (1 Yr)",
      ],
      buttonText: "Choose Plan",
      buttonClass: "bg-[#00A3B5] hover:bg-[#008a99] text-white",
    },
    {
      name: "Standard",
      price: "₹4,999",
      originalPrice: "₹6,999",
      color: "#00B050",
      features: [
        "ITR-1 to ITR-4",
        "Form 16",
        "Other Income",
        "Tax Deductions",
        "Basic Form 16",
        "Standard Deductions",
        "Previous Year Returns (2 Yr)",
        "Capital Gains",
        "Foreign Income Sources (FIS)",
      ],
      buttonText: "Choose Plan",
      buttonClass: "bg-[#00B050] hover:bg-[#009040] text-white",
      popular: true,
    },
    {
      name: "Advanced",
      price: "₹9,999",
      originalPrice: "₹12,999",
      color: "#C5007F",
      features: [
        "ITR-1 to ITR-7",
        "Form 16",
        "Other Income",
        "Tax Deductions",
        "Basic Form 16",
        "Standard Deductions",
        "Previous Year Returns (3 Yr)",
        "Capital Gains",
        "Foreign Income Sources (FIS)",
        "Advanced Income Sources (AIS)",
      ],
      buttonText: "Choose Plan",
      buttonClass: "bg-[#C5007F] hover:bg-[#a30069] text-white",
    },
  ]

  return (
    <div className="mx-auto max-w-6xl px-4">
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="flex h-screen max-h-[600px]">
            {/* Sidebar - same as in DocumentsModule */}
            <div className="w-64 border-r border-gray-200 bg-white">
              <div className="flex items-center gap-2 border-b border-gray-200 p-4">
                <div className="h-8 w-8 overflow-hidden rounded-full bg-[#e9420c]">
                  <img src="/diverse-avatars.png" alt="User" className="h-full w-full object-cover" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">Kiran Shah</p>
                </div>
              </div>
              <nav className="p-2">
                <ul className="space-y-1">
                  <li>
                    <a
                      href="#"
                      className="flex items-center gap-3 rounded-md px-3 py-2 text-gray-600 hover:bg-gray-100"
                    >
                      <span className="text-gray-500">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path
                            d="M8 12H8.01M12 12H12.01M16 12H16.01M21 12C21 16.418 16.97 20 12 20C10.5286 20 9.14629 19.6376 7.94358 19C7.60128 19 6.4182 19.5 5 20C5 20 3.5 17 4.5 15C3.56854 13.6646 3 12.3844 3 11C3 6.582 7.03 3 12 3C16.97 3 21 6.582 21 12Z"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      Chat
                    </a>
                  </li>
                  <li>
                    <a
                      href="#"
                      className="flex items-center gap-3 rounded-md px-3 py-2 text-gray-600 hover:bg-gray-100"
                    >
                      <span className="text-gray-500">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path
                            d="M9 12H15M9 16H15M9 8H15M5 21H19C20.1046 21 21 20.1046 21 19V5C21 3.89543 20.1046 3 19 3H5C3.89543 3 3 3.89543 3 5V19C3 20.1046 3.89543 21 5 21Z"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      Documents
                    </a>
                  </li>
                  <li>
                    <a
                      href="#"
                      className="flex items-center gap-3 rounded-md bg-gray-100 px-3 py-2 text-gray-900 hover:bg-gray-100"
                    >
                      <span className="text-gray-500">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path
                            d="M9 5H7C5.89543 5 5 5.89543 5 7V19C5 20.1046 5.89543 21 7 21H17C18.1046 21 19 20.1046 19 19V7C19 5.89543 18.1046 5 17 5H15M9 5C9 6.10457 9.89543 7 11 7H13C14.1046 7 15 6.10457 15 5M9 5C9 3.89543 9.89543 3 11 3H13C14.1046 3 15 3.89543 15 5M12 12H15M12 16H15M9 12H9.01M9 16H9.01"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      Plans
                    </a>
                  </li>
                  <li>
                    <a
                      href="#"
                      className="flex items-center gap-3 rounded-md px-3 py-2 text-gray-600 hover:bg-gray-100"
                    >
                      <span className="text-gray-500">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path
                            d="M9 7H5C3.89543 7 3 7.89543 3 9V18C3 19.1046 3.89543 20 5 20H19C20.1046 20 21 19.1046 21 18V9C21 7.89543 20.1046 7 19 7H15M9 7V5C9 3.89543 9.89543 3 11 3H13C14.1046 3 15 3.89543 15 5V7M9 7H15"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      Billing
                    </a>
                  </li>
                </ul>
              </nav>
            </div>

            {/* Main content */}
            <div className="flex-1 overflow-auto bg-white p-6">
              <div className="grid gap-6 md:grid-cols-3">
                {plans.map((plan, index) => (
                  <div key={index} className="relative flex flex-col rounded-lg border border-gray-200 bg-white">
                    {plan.popular && (
                      <div className="absolute -right-1 -top-1 rounded-full bg-red-500 px-2 py-1 text-xs font-medium text-white">
                        Popular
                      </div>
                    )}
                    <div
                      className="rounded-t-lg p-4"
                      style={{ backgroundColor: `${plan.color}10`, borderBottom: `2px solid ${plan.color}` }}
                    >
                      <h3 className="text-lg font-medium" style={{ color: plan.color }}>
                        {plan.name}
                      </h3>
                      <div className="mt-2 flex items-baseline">
                        <span className="text-2xl font-bold text-gray-900">{plan.price}</span>
                        <span className="ml-2 text-sm text-gray-500 line-through">{plan.originalPrice}</span>
                        <span className="ml-2 text-xs text-gray-500">per year</span>
                      </div>
                    </div>
                    <div className="flex flex-1 flex-col p-4">
                      <ul className="mb-6 space-y-2">
                        {plan.features.map((feature, i) => (
                          <li key={i} className="flex items-start">
                            <Check className="mr-2 h-5 w-5 shrink-0 text-green-500" />
                            <span className="text-sm text-gray-700">{feature}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-auto">
                        <Button className={`w-full ${plan.buttonClass}`}>{plan.buttonText}</Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">Want to get bulk discount?</h3>
                    <p className="text-sm text-gray-600">
                      We offer discounts to bulk orders so that you may benefit by filing for the entire team at once.
                    </p>
                  </div>
                  <Button className="whitespace-nowrap bg-[#e9420c] hover:bg-[#d13b0b]">Talk to us</Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
