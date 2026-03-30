import Cookies from 'js-cookie';

const COOKIE_NAME = `auth_token_${import.meta.env.MODE}`;

export const login = (email: string, password: string): boolean => {
    if (email === 'test@test.com' && password === 'password') {
        const Token = 'Bearer dummy-token' + Date.now();
        Cookies.set(COOKIE_NAME, Token, {
            expires: 7,
            secure: false,
            sameSite: 'strict'
        });
        return true;
    }
    return false;
};

export const logout = () => {
    Cookies.remove(COOKIE_NAME);
};

export const isLogin = (): boolean => {
    const token = Cookies.get(COOKIE_NAME);
    return !!token;
};

export const getToken = (): string | undefined => {
    return Cookies.get(COOKIE_NAME);
};