import {
    Flex,
    Heading,
    Box
} from '@chakra-ui/react'

const Positions = ({content}) => {

    const pads = ".75em 0"
    const border = "1px solid white"

    return (

        <Flex marginTop={["1em", null, 0]} width={["85vw",null,"40vw" ]}align="left" direction="column" marginRight="5em" >
            <Heading size="2xl" marginBottom=".2em">{content.company}</Heading>
            <Heading size="md" borderTop={border} borderBottom={border} padding={pads} fontStyle="italic">{content.title}</Heading>
            <Box paddingTop="1em">{content.description}</Box>
        </Flex>
    )

}

export default Positions