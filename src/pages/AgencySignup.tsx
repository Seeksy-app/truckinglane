import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LogoIcon } from '@/components/Logo';
import { toast } from 'sonner';
import { Loader2, Building2, Check, ArrowRight, Clock } from 'lucide-react';
import { z } from 'zod';

// Phone formatting helper
const formatPhoneNumber = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  if (digits.length === 0) return '';
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
};

// Validation schema
const requestFormSchema = z.object({
  agencyName: z.string().min(2, 'Agency name must be at least 2 characters').max(100),
  ownerName: z.string().min(2, 'Name must be at least 2 characters').max(100),
  ownerEmail: z.string().email('Please enter a valid email'),
  ownerPhone: z.string().regex(/^\(\d{3}\) \d{3}-\d{4}$/, 'Please enter a valid phone number'),
  addressLine1: z.string().min(3, 'Address is required').max(100),
  addressLine2: z.string().max(100).optional(),
  city: z.string().min(2, 'City is required').max(50),
  state: z.string().length(2, 'Please enter 2-letter state code'),
  zip: z.string().regex(/^\d{5}(-\d{4})?$/, 'Please enter a valid ZIP code'),
  agentCount: z.string().min(1, 'Please select agent count'),
  dailyLoadVolume: z.string().min(1, 'Please select daily load volume'),
});

type Step = 'request' | 'submitted';

const ACCOUNT_TYPE_OPTIONS = [
  { value: 'agency', label: 'Agency' },
  { value: 'broker', label: 'Broker' },
];

const AGENT_COUNT_OPTIONS = [
  { value: '1-2', label: '1-2 agents' },
  { value: '3-5', label: '3-5 agents' },
  { value: '6-10', label: '6-10 agents' },
  { value: '11-25', label: '11-25 agents' },
  { value: '26-50', label: '26-50 agents' },
  { value: '50+', label: '50+ agents' },
];

const DAILY_LOAD_OPTIONS = [
  { value: '1-5', label: '1-5 loads/day' },
  { value: '6-15', label: '6-15 loads/day' },
  { value: '16-30', label: '16-30 loads/day' },
  { value: '31-50', label: '31-50 loads/day' },
  { value: '51-100', label: '51-100 loads/day' },
  { value: '100+', label: '100+ loads/day' },
];

export default function AgencySignup() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('request');
  const [loading, setLoading] = useState(false);

  // Form fields
  const [agencyName, setAgencyName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [agentCount, setAgentCount] = useState('');
  const [dailyLoadVolume, setDailyLoadVolume] = useState('');
  const [accountType, setAccountType] = useState('agency');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setOwnerPhone(formatPhoneNumber(e.target.value));
  };

  const handleStateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setState(e.target.value.toUpperCase().slice(0, 2));
  };

  const handleZipChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^\d-]/g, '').slice(0, 10);
    setZip(value);
  };

  const validateForm = () => {
    try {
      requestFormSchema.parse({
        agencyName,
        ownerName,
        ownerEmail,
        ownerPhone,
        addressLine1,
        addressLine2: addressLine2 || undefined,
        city,
        state,
        zip,
        agentCount,
        dailyLoadVolume,
      });
      setErrors({});
      return true;
    } catch (err) {
      if (err instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {};
        err.errors.forEach((e) => {
          if (e.path[0]) {
            fieldErrors[e.path[0] as string] = e.message;
          }
        });
        setErrors(fieldErrors);
      }
      return false;
    }
  };

  const handleSubmitRequest = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      const response = await fetch(
        'https://vjgakkomhphvdbwjjwiv.supabase.co/functions/v1/submit-agency-request',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agencyName,
            ownerName,
            ownerEmail: ownerEmail.toLowerCase(),
            ownerPhone,
            addressLine1,
            addressLine2: addressLine2 || null,
            city,
            state,
            zip,
            agentCount,
            dailyLoadVolume,
            accountType,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to submit request');
      }

      toast.success('Request submitted successfully!');
      setStep('submitted');
    } catch (error) {
      console.error('Request submission error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to submit request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <LogoIcon className="w-12 h-12" />
            <span className="font-bold text-2xl">Trucking Lane</span>
          </div>
          <p className="text-muted-foreground">
            {step === 'request' && 'Request an agency account'}
            {step === 'submitted' && 'Request submitted!'}
          </p>
        </div>

        {/* Request Form */}
        {step === 'request' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Agency Information
              </CardTitle>
              <CardDescription>
                Submit your details to request an agency account. We'll review your request and get back to you.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="accountType">Account Type</Label>
                <Select value={accountType} onValueChange={setAccountType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="agencyName">Agency Name</Label>
                <Input
                  id="agencyName"
                  value={agencyName}
                  onChange={(e) => setAgencyName(e.target.value)}
                  placeholder="Enter your agency name"
                />
                {errors.agencyName && (
                  <p className="text-sm text-destructive">{errors.agencyName}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="ownerName">Your Name</Label>
                <Input
                  id="ownerName"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="Your full name"
                />
                {errors.ownerName && (
                  <p className="text-sm text-destructive">{errors.ownerName}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="ownerEmail">Email</Label>
                <Input
                  id="ownerEmail"
                  type="email"
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  placeholder="you@company.com"
                />
                {errors.ownerEmail && (
                  <p className="text-sm text-destructive">{errors.ownerEmail}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="ownerPhone">Phone</Label>
                <Input
                  id="ownerPhone"
                  type="tel"
                  value={ownerPhone}
                  onChange={handlePhoneChange}
                  placeholder="(555) 123-4567"
                />
                {errors.ownerPhone && (
                  <p className="text-sm text-destructive">{errors.ownerPhone}</p>
                )}
              </div>

              {/* Address Fields */}
              <div className="space-y-2">
                <Label htmlFor="addressLine1">Address Line 1</Label>
                <Input
                  id="addressLine1"
                  value={addressLine1}
                  onChange={(e) => setAddressLine1(e.target.value)}
                  placeholder="123 Main Street"
                />
                {errors.addressLine1 && (
                  <p className="text-sm text-destructive">{errors.addressLine1}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="addressLine2">Address Line 2 <span className="text-muted-foreground">(optional)</span></Label>
                <Input
                  id="addressLine2"
                  value={addressLine2}
                  onChange={(e) => setAddressLine2(e.target.value)}
                  placeholder="Suite 100"
                />
              </div>

              <div className="grid grid-cols-5 gap-3">
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="City"
                  />
                  {errors.city && (
                    <p className="text-sm text-destructive">{errors.city}</p>
                  )}
                </div>
                <div className="col-span-1 space-y-2">
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    value={state}
                    onChange={handleStateChange}
                    placeholder="TX"
                    maxLength={2}
                  />
                  {errors.state && (
                    <p className="text-sm text-destructive">{errors.state}</p>
                  )}
                </div>
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="zip">ZIP Code</Label>
                  <Input
                    id="zip"
                    value={zip}
                    onChange={handleZipChange}
                    placeholder="12345"
                  />
                  {errors.zip && (
                    <p className="text-sm text-destructive">{errors.zip}</p>
                  )}
                </div>
              </div>

              {/* Agent Count */}
              <div className="space-y-2">
                <Label htmlFor="agentCount">How many agents do you have?</Label>
                <Select value={agentCount} onValueChange={setAgentCount}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select agent count" />
                  </SelectTrigger>
                  <SelectContent>
                    {AGENT_COUNT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.agentCount && (
                  <p className="text-sm text-destructive">{errors.agentCount}</p>
                )}
              </div>

              {/* Daily Load Volume */}
              <div className="space-y-2">
                <Label htmlFor="dailyLoadVolume">How many loads do you book per day?</Label>
                <Select value={dailyLoadVolume} onValueChange={setDailyLoadVolume}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select daily load volume" />
                  </SelectTrigger>
                  <SelectContent>
                    {DAILY_LOAD_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.dailyLoadVolume && (
                  <p className="text-sm text-destructive">{errors.dailyLoadVolume}</p>
                )}
              </div>

              <Button
                onClick={handleSubmitRequest}
                disabled={loading}
                className="w-full mt-4"
                size="lg"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    Submit Request
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{' '}
                <Button variant="link" className="p-0 h-auto" onClick={() => navigate('/auth')}>
                  Sign in
                </Button>
              </p>
            </CardContent>
          </Card>
        )}

        {/* Submitted Confirmation */}
        {step === 'submitted' && (
          <Card>
            <CardContent className="pt-8 pb-8 text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Clock className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Request Submitted!</h2>
              <p className="text-muted-foreground mb-6">
                Thank you for your interest in Trucking Lane. We'll review your request for <strong>{agencyName}</strong> and send you an email at <strong>{ownerEmail}</strong> once approved.
              </p>

              <div className="bg-muted/50 rounded-lg p-4 text-left mb-6">
                <h3 className="font-medium mb-2">What happens next?</h3>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    Our team will review your request
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    You'll receive an email to complete your account setup
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    Set your password and invite your team
                  </li>
                </ul>
              </div>

              <Button variant="outline" onClick={() => navigate('/')}>
                Return to Home
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
