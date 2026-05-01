module.exports = {
    apps: [
        {
            name: 'uk-service',
            script: 'packages/uk-service/src/index.ts',
            interpreter: '/root/anjelbuff/node_modules/.bin/tsx',
            cwd: '/root/anjelbuff',
            env_file: './packages/uk-service/.env',
            restart_delay: 5000,
            max_restarts: 10,
        },
    ],
};
