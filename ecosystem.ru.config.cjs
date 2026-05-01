module.exports = {
    apps: [
        {
            name: 'ru-worker',
            script: 'packages/ru-worker/src/index.ts',
            interpreter: '/root/anjelbuff/node_modules/.bin/tsx',
            cwd: '/root/anjelbuff',
            env_file: './packages/ru-worker/.env',
            restart_delay: 5000,
            max_restarts: 10,
        },
    ],
};
