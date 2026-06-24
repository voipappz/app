import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { login as accountLogin } from '../../lib/auth';

export const useLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState({
    email: false,
    password: false
  });

  const { login, setLoading, setError, loading, error } = useAuth();
  const navigate = useNavigate();

  const handleEmailChange = (e) => setEmail(e.target.value);
  const handlePasswordChange = (e) => setPassword(e.target.value);

  const handleBlur = (field) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    // Mark all fields as touched on submit
    setTouched({ email: true, password: true });

    // Validate required fields
    if (!email || !password) {
      setError('Email and password are required');
      return;
    }

    setLoading();

    try {
      // Authenticate against the accounts table via deno → PostgREST /rpc/login.
      // Returns the signed session (JWT + account/customer/environment claims).
      const session = await accountLogin(email, password);
      login(session);
      navigate('/dashboard');
    } catch (error) {
      console.error("Login error:", error);
      setError(error?.message || 'Login failed. Please try again.', error);
    }
  };

  return {
    email,
    password,
    touched,
    loading,
    error,
    handleEmailChange,
    handlePasswordChange,
    handleBlur,
    handleSubmit
  };
};
