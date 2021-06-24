import "reflect-metadata";
import { PrismaClient } from "@prisma/client";
import express from "express";
import cors from "cors";
import {
    fieldExtensionsEstimator,
    getComplexity,
    simpleEstimator,
} from "graphql-query-complexity";
import dotenv from "dotenv";
import session from "express-session";
import connectRedis from "connect-redis";
import Redis from "ioredis";
import createSchema from "./util/CreateSchema";
import ContextType from "./types/Context.type";
import { ApolloServer } from "apollo-server-express";
import { projectName } from "./constants";
import { GithubOAuth } from "./auth/strategies/GithubOAuth";
import passport from "passport";
import { PassportGenericUser } from "./auth/types/PassportGenericUser.type";
import UserRepo from "./db/UserRepo";

async function main() {
    // initialize dontenv
    dotenv.config();

    // Initialize Redis
    const RedisStore = connectRedis(session);
    const redis = new Redis();

    // Initialize Apollo Server
    const schema = await createSchema();
    const gqlServer = new ApolloServer({
        schema,
        context: ({ req, res }: ContextType) => ({
            req,
            res,
            prisma: new PrismaClient(),
        }),
        plugins: [
            {
                requestDidStart: () => ({
                    didResolveOperation({ request, document }) {
                        const complexity = getComplexity({
                            schema,
                            operationName: request.operationName,
                            query: document,
                            variables: request.variables,
                            estimators: [
                                fieldExtensionsEstimator(),
                                simpleEstimator({ defaultComplexity: 1 }),
                            ],
                        });

                        const maximumQueryComplexity = 30;

                        if (complexity > maximumQueryComplexity) {
                            console.log(complexity);

                            throw new Error(
                                `Maximum query complexity of ${maximumQueryComplexity} has been reached.`
                            );
                        }
                    },
                }),
            },
        ],
    });

    // Create Express Server
    const expressServer = express();

    // Express Middleware

    expressServer.use(
        cors({
            origin: "*",
            credentials: true,
        })
    );
    expressServer.use(
        session({
            name: "_hl_sess",
            secret: process.env.sessionSecret || "hydraliteispog",
            resave: false,
            saveUninitialized: false,
        })
    );

    // Passport Sessions
    const userRepo = new UserRepo();

    passport.serializeUser(async (_, done) => {
        const user: PassportGenericUser = _ as any;
        const dbUser = await userRepo.findOrCreateUser(
            user.primaryOauthConnection.oauthService,
            user
        );
        done(null, {
            id: dbUser.id,
        });
    });

    passport.deserializeUser<object>(async (user, done) => done(null, user));

    expressServer.use(passport.initialize());
    expressServer.use(passport.session());

    // Routes
    // general
    expressServer.get("/", function (req, res) {
        console.log("session", req.session);
        console.log("user", req.user);
        return res.json({
            message: `Welcome to ${projectName}`,
            authorized: !!req.isAuthenticated(),
        });
    });

    // auth
    expressServer.use("/api/auth", GithubOAuth(passport));
    expressServer.get("/api/auth/logout", function (req, res) {
        req.logout();
        res.redirect("/");
    });

    // Enable express to be used with gql
    gqlServer.applyMiddleware({ app: expressServer });

    // Start Server
    const port = process.env.PORT || 8000;
    expressServer.listen({ port }, () => {
        console.log(
            `Navigate to http://localhost:${port}${gqlServer.graphqlPath}`
        );
    });
}

main().catch((err) => console.error(err));
