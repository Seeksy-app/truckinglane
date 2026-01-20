import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LogoIcon } from '@/components/Logo';
import { toast } from 'sonner';
import { Loader2, Check, Upload, UserPlus } from 'lucide-react';

interface InviteData {
  id: string;
  email: string;
  role: string;
  agency_id: string;
  expires_at: string;
  accepted_at: string | null;
  agency_name?: string;
}

export default function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Form fields
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    const fetchInvite = async () => {
      if (!token) {
        setError('Invalid invite link');
        setLoading(false);
        return;
      }

      try {
        // Fetch invite using edge function (bypasses RLS)
        const response = await fetch(
          `https://vjgakkomhphvdbwjjwiv.supabase.co/functions/v1/get-invite?token=${token}`
        );

        const result = await response.json();

        if (!response.ok) {
          setError(result.error || 'Invalid or expired invite');
          setLoading(false);
          return;
        }

        setInvite(result.invite);
      } catch (err) {
        console.error('Fetch invite error:', err);
        setError('Failed to load invite');
      } finally {
        setLoading(false);
      }
    };

    fetchInvite();
  }, [token]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be less than 2MB');
      return;
    }

    setUploadingAvatar(true);
    try {
      // Generate unique filename
      const ext = file.name.split('.').pop();
      const fileName = `${crypto.randomUUID()}.${ext}`;
      
      const { data, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(data.path);

      setAvatarUrl(publicUrl);
      toast.success('Avatar uploaded!');
    } catch (err) {
      console.error('Avatar upload error:', err);
      toast.error('Failed to upload avatar');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleAcceptInvite = async () => {
    if (!invite || !token) return;

    if (!fullName.trim()) {
      toast.error('Please enter your name');
      return;
    }

    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(
        'https://vjgakkomhphvdbwjjwiv.supabase.co/functions/v1/accept-invite',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token,
            fullName: fullName.trim(),
            phone: phone.trim(),
            password,
            avatarUrl,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to accept invite');
      }

      toast.success('Account created successfully!');

      // Sign in the user
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: invite.email,
        password,
      });

      if (signInError) {
        toast.error('Account created but sign-in failed. Please log in manually.');
        navigate('/auth');
        return;
      }

      navigate('/dashboard');
    } catch (err) {
      console.error('Accept invite error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to accept invite');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !invite) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 text-center">
            <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">❌</span>
            </div>
            <h2 className="text-xl font-bold mb-2">Invalid Invite</h2>
            <p className="text-muted-foreground mb-6">
              {error || 'This invite link is invalid or has expired.'}
            </p>
            <Button onClick={() => navigate('/auth')}>Go to Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (invite.accepted_at) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 text-center">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold mb-2">Invite Already Accepted</h2>
            <p className="text-muted-foreground mb-6">
              This invite has already been used. Please sign in with your account.
            </p>
            <Button onClick={() => navigate('/auth')}>Go to Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <LogoIcon className="w-12 h-12" />
            <span className="font-bold text-2xl">Trucking Lane</span>
          </div>
          <p className="text-muted-foreground">Complete your account setup</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Join {invite.agency_name || 'Agency'}
            </CardTitle>
            <CardDescription>
              You've been invited as {invite.role === 'agency_admin' ? 'an Admin' : 'an Agent'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Avatar upload */}
            <div className="flex flex-col items-center gap-3">
              <Avatar className="h-20 w-20">
                <AvatarImage src={avatarUrl || undefined} />
                <AvatarFallback className="text-lg bg-primary/10 text-primary">
                  {fullName ? fullName.charAt(0).toUpperCase() : '?'}
                </AvatarFallback>
              </Avatar>
              <Label htmlFor="avatar" className="cursor-pointer">
                <div className="flex items-center gap-2 text-sm text-primary hover:underline">
                  {uploadingAvatar ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {avatarUrl ? 'Change photo' : 'Upload photo (optional)'}
                </div>
                <input
                  id="avatar"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarUpload}
                  disabled={uploadingAvatar}
                />
              </Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={invite.email}
                disabled
                className="bg-muted"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone (optional)</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 123-4567"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
              />
            </div>

            <Button
              onClick={handleAcceptInvite}
              disabled={submitting}
              className="w-full mt-4"
              size="lg"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating Account...
                </>
              ) : (
                'Accept Invitation'
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
