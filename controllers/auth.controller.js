const { User } = require('../models');
const jwt = require('jsonwebtoken');

const generateTokens = (user) => {
    const accessToken = jwt.sign(
        { id: user.id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE || '1h' }
    );

    const refreshToken = jwt.sign(
        { id: user.id },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d' }
    );

    return { accessToken, refreshToken };
};

exports.register = async (request, reply) => {
    try {
        const { name, email, password, role } = request.body;

        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
            return reply.status(400).send({ success: false, message: 'Email already exists' });
        }

        const user = await User.create({
            name,
            email,
            password,
            role: role || 'creator'
        });

        const { accessToken, refreshToken } = generateTokens(user);

        reply.status(201).send({
            success: true,
            message: 'User registered successfully',
            data: {
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role
                },
                accessToken,
                refreshToken
            }
        });
    } catch (error) {
        reply.status(500).send({ success: false, message: error.message });
    }
};

exports.login = async (request, reply) => {
    try {
        const { email, password } = request.body;

        const user = await User.findOne({ where: { email } });
        if (!user || !(await user.comparePassword(password))) {
            return reply.status(401).send({ success: false, message: 'Invalid credentials' });
        }

        if (user.status !== 'active') {
            return reply.status(403).send({ success: false, message: 'Account is deactivated' });
        }

        const { accessToken, refreshToken } = generateTokens(user);

        reply.send({
            success: true,
            message: 'Logged in successfully',
            data: {
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role
                },
                accessToken,
                refreshToken
            }
        });
    } catch (error) {
        reply.status(500).send({ success: false, message: error.message });
    }
};

exports.refreshToken = async (request, reply) => {
    try {
        const { refreshToken } = request.body;
        if (!refreshToken) {
            return reply.status(400).send({ success: false, message: 'Refresh token is required' });
        }

        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        const user = await User.findByPk(decoded.id);

        if (!user || user.status !== 'active') {
            return reply.status(401).send({ success: false, message: 'Invalid token' });
        }

        const tokens = generateTokens(user);

        reply.send({
            success: true,
            data: tokens
        });
    } catch (error) {
        reply.status(401).send({ success: false, message: 'Invalid refresh token' });
    }
};

