module.exports = {
    apps: [
        {
            name: 'ru-worker',
            script: 'src/index.ts',
            interpreter: '/root/anjelbuff/node_modules/.bin/tsx',
            cwd: '/root/anjelbuff/packages/ru-worker',
            restart_delay: 5000,
            max_restarts: 10,
        },
    ],
};
