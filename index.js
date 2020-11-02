const { ApolloServer, gql, UserInputError } = require('apollo-server')
const { v1: uuid } = require('uuid')
const mongoose = require('mongoose')

const Book = require('./models/book')
const Author = require('./models/author')

const config = require('./utils/config')
const { books, authors } = require('./utils/init')

mongoose.connect(config.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true, useFindAndModify: false, useCreateIndex: true })
	.then(() => {
		console.log('connected to MongoDB')
	})
	.catch((error) => {
		console.log('error connecting to MongoDB: ', error.message)
	})

const typeDefs = gql`
	type Book {
		title: String!
		published: Int!
		author: Author!
		genres: [String!]!
		id: ID!
	}

	type Author {
		name: String!
		born: Int
		bookCount: Int!
		id: ID!
	}

  type Query {
		bookCount: Int!
		authorCount: Int!
		allBooks(author: String, genre: String): [Book!]!
		allAuthors: [Author!]!
	}
	
	type Mutation {
		addBook(
			title: String!
			author: String!
			published: Int!
			genres: [String!]!
		): Book
		editAuthor(
			name: String!
			setBornTo: Int!
		): Author
	}
`

const resolvers = {
  Query: {
		bookCount: () => books.length,
		authorCount: () => authors.length,
		allBooks: (root, args) => {
			return Book.find({}).populate('author')
			// if (!args.author && !args.genre) return books

			// const byArgs = (book) => {
			// 	const byAuthor = !args.author || book.author === args.author
			// 	const byGenre = !args.genre || book.genres.includes(args.genre)
			// 	return byAuthor && byGenre
			// }

			// return books.filter(byArgs)
		},
		allAuthors: () => Author.find({})
	},
	Mutation: {
		addBook: async (root, args) => {
			// if (!authors.find(a => a.name === args.author)) {
			// 	const author = {
			// 		name: args.author,
			// 		id: uuid()
			// 	}
			// 	authors = authors.concat(author)
			// }

			const author = await Author.findOne({ name: args.author })

			if (!author) {
				author = new Author({
					name: args.author
				})

				try {
					await author.save()
				} catch (error) {
					throw new UserInputError(error.message, {
						invalidArgs: args
					})
				}
			}

			// const book = { ...args, id: uuid() }
			// books = books.concat(book)
			// return book
			const book = new Book({ ...args, author })
			try {
				await book.save()
			} catch (error) {
				throw new UserInputError(error.message, {
					invalidArgs: args
				})
			}

			return book
		},
		editAuthor: (root, args) => {
			const author = authors.find(a => a.name === args.name)
			if (!author) return null

			const updatedAuthor = { ...author, born: args.setBornTo }
			authors = authors.map(a => a.name === args.name ? updatedAuthor : a)
			return updatedAuthor
		}
	},
	Author: {
		bookCount: (root) => books.filter(book => book.author === root.name).length
	}
}

const server = new ApolloServer({
  typeDefs,
  resolvers,
})

server.listen().then(({ url }) => {
  console.log(`Server ready at ${url}`)
})